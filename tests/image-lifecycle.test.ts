// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, effectScope, h, nextTick, ref, computed, type App, type EffectScope } from 'vue'
import AssetImage from '../src/components/signatures/AssetImage.vue'
import { useDecorations, type DecorationsContext } from '../src/composables/useDecorations'
import type { DocumentRecord } from '../src/types/documents'

const api = vi.hoisted(() => ({ assetImage: vi.fn(), decorationImage: vi.fn() }))
vi.mock('../src/services/documents.service', () => ({ documentsApi: api }))

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
async function settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); await nextTick() } }
let app: App | undefined
let host: HTMLDivElement | undefined
let scope: EffectScope | undefined
let dispose: (() => void) | undefined

beforeEach(() => {
  vi.resetAllMocks()
  let serial = 0
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:image-${++serial}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => {
  app?.unmount(); app = undefined
  host?.remove(); host = undefined
  dispose?.(); dispose = undefined
  scope?.stop(); scope = undefined
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

describe('signature Object URL ownership', () => {
  function mount() {
    const guid = ref('first')
    host = document.createElement('div'); document.body.append(host)
    app = createApp({ render: () => h(AssetImage, { guid: guid.value }) })
    app.mount(host)
    return guid
  }

  it('keeps the displayed URL alive after image load and releases it only on replacement or unmount', async () => {
    api.assetImage.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const guid = mount(); await settle()
    expect(host!.querySelector('img')!.getAttribute('src')).toBe('blob:image-1')
    host!.querySelector('img')!.dispatchEvent(new Event('load')); await settle()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    guid.value = 'second'; await settle()
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:image-1')
    expect(host!.querySelector('img')!.getAttribute('src')).toBe('blob:image-2')
    app!.unmount(); app = undefined
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenLastCalledWith('blob:image-2')
  })

  it('aborts superseded requests and ignores late responses, including after unmount', async () => {
    const first = deferred<Blob>(), second = deferred<Blob>()
    api.assetImage.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const guid = mount()
    const firstSignal = api.assetImage.mock.calls[0]![1] as AbortSignal
    guid.value = 'second'; await settle()
    expect(firstSignal.aborted).toBe(true)
    first.resolve(new Blob(['old'])); await settle()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    app!.unmount(); app = undefined
    expect((api.assetImage.mock.calls[1]![1] as AbortSignal).aborted).toBe(true)
    second.resolve(new Blob(['late'])); await settle()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('shows the existing error state when the binary request fails', async () => {
    api.assetImage.mockRejectedValue(new Error('Invalid image response'))
    mount(); await settle()
    expect(host!.querySelector('img')).toBeNull()
    expect(host!.textContent).toContain('Gambar belum dapat dimuat')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})

describe('decoration Object URL ownership', () => {
  function setup() {
    let active = true
    const ctx: DecorationsContext = {
      document: ref<DocumentRecord>(), editable: computed(() => true), reviewed: ref(false),
      error: ref(''), locked: ref(false), isActive: () => active,
      scheduleSave: vi.fn(), rebuildPreview: vi.fn(),
    }
    scope = effectScope()
    const decorations = scope.run(() => useDecorations(ctx))!
    dispose = () => { active = false; decorations.dispose() }
    return { ctx, ...decorations }
  }
  function selection(name: string) {
    return { target: { files: [new File(['image'], name, { type: 'image/png' })], value: name } } as unknown as Event
  }
  function bitmap() { return { width: 1200, height: 300, close: vi.fn() } as unknown as ImageBitmap }

  it('does not allocate a URL when decoding finishes after disposal', async () => {
    const decode = deferred<ImageBitmap>(), image = bitmap()
    vi.stubGlobal('createImageBitmap', vi.fn(() => decode.promise))
    const model = setup()
    const pending = model.chooseDecoration('letterhead', selection('kop.png'))
    dispose!()
    decode.resolve(image); await pending
    expect(image.close).toHaveBeenCalledOnce()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
    expect(model.decorations.value.letterhead.imageUrl).toBe('')
  })

  it('keeps the newest selected image when bitmap decodes finish out of order', async () => {
    const first = deferred<ImageBitmap>(), second = deferred<ImageBitmap>()
    vi.stubGlobal('createImageBitmap', vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise))
    const model = setup()
    const old = model.chooseDecoration('footer', selection('old.png'))
    const latest = model.chooseDecoration('footer', selection('latest.png'))
    second.resolve(bitmap()); await latest
    first.resolve(bitmap()); await old
    expect(model.decorations.value.footer.file?.name).toBe('latest.png')
    expect(model.decorations.value.footer.imageUrl).toBe('blob:image-1')
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  })

  it('invalidates an in-flight decode when an image is removed', async () => {
    const decode = deferred<ImageBitmap>()
    vi.stubGlobal('createImageBitmap', vi.fn(() => decode.promise))
    const model = setup()
    const pending = model.chooseDecoration('footer', selection('footer.png'))
    model.removeDecoration('footer')
    decode.resolve(bitmap()); await pending
    expect(model.decorations.value.footer.remove).toBe(true)
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('revokes a local preview on replacement and disposal, retaining it while displayed', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap()))
    const model = setup()
    await model.chooseDecoration('letterhead', selection('first.png'))
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    await model.chooseDecoration('letterhead', selection('second.png'))
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:image-1')
    expect(model.decorations.value.letterhead.imageUrl).toBe('blob:image-2')
    dispose!()
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenLastCalledWith('blob:image-2')
  })

  it('keeps saved previews alive and ignores aborted API responses after replacement or disposal', async () => {
    const first = deferred<Blob>(), last = deferred<Blob>()
    api.decorationImage.mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(new Blob(['current'], { type: 'image/png' }))
      .mockReturnValueOnce(last.promise)
    const model = setup()
    model.ctx.document.value = {
      guid: 'document', public_reference: 'DOC', title: 'Test', status: 'draft', owner_guid: 'owner',
      hidden_at: null, is_hidden: false, created_at: '', updated_at: '',
      current_version: { guid: 'version', document_guid: 'document', version_number: 1, status: 'draft',
        preview_status: 'none', published_at: null, updated_at: '',
        letterhead: { image_url: '/image', pages: { mode: 'all' } } },
    }
    model.syncDecorations()
    const oldSignal = api.decorationImage.mock.calls[0]![2] as AbortSignal
    model.syncDecorations(); await settle()
    expect(oldSignal.aborted).toBe(true)
    expect(model.decorations.value.letterhead.imageUrl).toBe('blob:image-1')
    first.resolve(new Blob(['old'])); await settle()
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    model.syncDecorations()
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:image-1')
    dispose!()
    expect((api.decorationImage.mock.calls[2]![2] as AbortSignal).aborted).toBe(true)
    last.resolve(new Blob(['late'])); await settle()
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(model.decorations.value.letterhead.imageUrl).toBe('')
  })
})

// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { createApp, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'
import AssetLibrary from '../src/components/signatures/AssetLibrary.vue'
import InteractionHost from '../src/components/ui/InteractionHost.vue'
import { http } from '../src/services/http'
import { confirmation, finishConfirmation } from '../src/services/feedback'
import { useAuthStore } from '../src/stores/auth'
import { setWorkspaceActive, setWorkspaceLanguage } from '../src/services/workspace-language'
import type { SignatureAsset } from '../src/types/documents'

const feedback = vi.hoisted(() => ({
  confirmAction: vi.fn(),
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))
vi.mock('../src/services/feedback', async (original) => ({
  ...(await original<typeof import('../src/services/feedback')>()),
  ...feedback,
}))
vi.mock('../src/services/http', async (original) => ({
  ...(await original<typeof import('../src/services/http')>()),
  authMode: 'api',
}))
// Real pointer input, stroke preservation and HiDPI are covered in signature-canvas.test.ts.
vi.mock('../src/components/signatures/SignatureCanvas.vue', async () => {
  const { h } = await import('vue')
  return {
    default: {
      emits: ['created'],
      setup(_: unknown, { emit }: { emit: (event: string, file: File) => void }) {
        return () => h('button', {
          onClick: () => emit('created', new File(['drawn'], 'tanda-tangan.png', { type: 'image/png' })),
        }, 'Gunakan coretan')
      },
    },
  }
})

type Reply = { status: number; code?: string; fields?: Record<string, string[]>; headers?: Record<string, string> }
const postReply = vi.fn<() => Promise<Reply>>()
const originalAdapter = http.defaults.adapter
let calls: InternalAxiosRequestConfig[]
let saved: SignatureAsset[]
let app: App | undefined
let feedbackApp: App | undefined
let host: HTMLDivElement
const asset: SignatureAsset = {
  guid: 'saved-signature', source_type: 'upload', mime_type: 'image/png',
  width: 800, height: 300, size_bytes: 128, image_url: '/image', created_at: '2026-10-23T00:00:00Z',
}

function deferred<T>() {
  let resolve!: (result: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function settle() {
  for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() }
}
function button(text: string) {
  const result = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === text)
  if (!result) throw new Error(`Button not found: ${text}`)
  return result
}
function preview() { return host.querySelector<HTMLImageElement>('img[alt="Preview aset baru"]') }
function posts() { return calls.filter((call) => call.method === 'post') }
async function mount(selectable = false) {
  host = document.createElement('div')
  document.body.append(host)
  const selected = vi.fn()
  app = createApp(AssetLibrary, { standalone: true, selectable, onSelect: selected })
  const pinia = createPinia()
  app.use(pinia)
  useAuthStore(pinia).user = { guid: 'test-user', name: 'Test', email: 'test@example.test', email_verified: true }
  app.mount(host)
  await settle()
  return selected
}
async function choose(source: 'upload' | 'drawn' = 'upload', file = new File(['image'], 'signature.png', { type: 'image/png' })) {
  button(source === 'upload' ? 'Unggah gambar' : 'Coretan langsung').click()
  await settle()
  if (source === 'drawn') button('Gunakan coretan').click()
  else {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }
  await settle()
  return file
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
  setWorkspaceLanguage('id')
  calls = []
  saved = []
  postReply.mockReset().mockResolvedValue({ status: 201 })
  feedback.confirmAction.mockResolvedValue(true)
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:signature-${calls.length}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(function (this: HTMLImageElement) {
    this.width = 800; this.height = 300
    return Promise.resolve()
  })
  http.defaults.adapter = async (config) => {
    calls.push(config)
    let reply: Reply = { status: 200 }
    let data: unknown = ''
    if (config.method === 'delete') {
      saved = []
      reply = { status: 204 }
    } else if (config.method === 'post') {
      reply = await postReply()
      if (reply.status === 201) {
        const created = { ...asset, source_type: (config.data as FormData).get('source_type') }
        saved = [created as SignatureAsset]
        data = { data: created }
      } else data = { error: { code: reply.code, message: 'private provider details', errors: reply.fields ?? {} }, meta: { request_id: 'test-request' } }
    } else if (config.url?.includes('/signature-assets?') || config.url?.endsWith('/signature-assets')) {
      data = { data: saved, meta: { current_page: 1, last_page: 1, per_page: 6, total: saved.length }, links: { prev: null, next: null } }
    } else if (config.url?.endsWith('/image')) data = new Blob(['png'], { type: 'image/png' })
    const response = { config, status: reply.status, data, headers: new AxiosHeaders(reply.headers), statusText: '' }
    // Axios adapters settle HTTP responses using the request's status validator.
    if (config.validateStatus && !config.validateStatus(reply.status)) throw new AxiosError('private provider details', undefined, config, undefined, response)
    return response
  }
})
afterEach(() => {
  feedbackApp?.unmount(); feedbackApp = undefined
  app?.unmount(); app = undefined
  host?.remove()
  http.defaults.adapter = originalAdapter
  setWorkspaceActive(false)
  setWorkspaceLanguage('id')
  finishConfirmation(false)
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('signature classification submission with mocked Axios transport', () => {
  it.each(['upload', 'drawn'] as const)('persists %s only after 201 and refreshes the list, count and selection', async (source) => {
    const selected = await mount(true)
    const file = await choose(source)
    button('Simpan aset').click(); await settle()
    expect(posts()).toHaveLength(1)
    expect(posts()[0]!.url).toBe('http://localhost:8000/api/v1/signature-assets')
    expect(posts()[0]!.data).toBeInstanceOf(FormData)
    expect((posts()[0]!.data as FormData).get('source_type')).toBe(source)
    expect((posts()[0]!.data as FormData).get('file')).toMatchObject({ name: source === 'drawn' ? 'tanda-tangan.png' : file.name })
    expect(posts()[0]!.timeout).toBe(75000)
    expect(http.defaults.timeout).toBe(15000)
    expect(calls.filter((call) => call.method === 'get' && call.url?.endsWith('/signature-assets'))).toHaveLength(2)
    expect(host.textContent).toContain('1 aset tersimpan')
    expect(host.querySelectorAll('button[aria-pressed]')).toHaveLength(1)
    expect(host.querySelector('#signature-tab-saved')?.getAttribute('aria-selected')).toBe('true')
    expect(preview()).toBeNull()
    expect(feedback.notify.success).toHaveBeenCalledWith('Aset tanda tangan tersimpan.')
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ guid: asset.guid, source_type: source }))
  })

  it.each([
    [422, 'SIGNATURE_IMAGE_NOT_SIGNATURE', 'Gambar bukan tanda tangan.'],
    [422, 'SIGNATURE_IMAGE_UNCERTAIN', 'Tanda tangan belum dapat diverifikasi.'],
    [422, 'SIGNATURE_IMAGE_INVALID', 'Gambar tanda tangan tidak valid.'],
    [422, 'VALIDATION_FAILED', 'Periksa kembali data yang Anda masukkan.'],
    [422, 'SIGNATURE_IMAGE_EMPTY', 'Coretan atau gambar tanda tangan tidak boleh kosong.'],
    [503, 'SIGNATURE_CLASSIFIER_UNAVAILABLE', 'Verifikasi sementara tidak tersedia.'],
    [503, 'SIGNATURE_IMAGE_PROCESSING_UNAVAILABLE', 'Gambar tanda tangan belum dapat diproses oleh server.'],
    [429, 'TOO_MANY_REQUESTS', 'Terlalu banyak percobaan. Silakan coba beberapa saat lagi.'],
    [500, 'INTERNAL_ERROR', 'Hasil permintaan belum dapat dipastikan.'],
    [200, undefined, 'Hasil permintaan belum dapat dipastikan.'],
  ] as const)('handles %s %s without clearing input or retrying automatically', async (status, code, message) => {
    postReply.mockResolvedValue({ status, code })
    await mount(); await choose()
    const image = preview()
    button('Simpan aset').click(); await settle()
    expect(host.textContent).toContain(message)
    expect(host.textContent).not.toContain('private provider details')
    expect(preview()).toBe(image)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    expect(button('Simpan aset').disabled).toBe(false)
    expect(host.querySelector('#signature-tab-upload')?.getAttribute('aria-selected')).toBe('true')
    expect(feedback.notify.error).toHaveBeenCalledWith(expect.stringContaining(message))
    expect(feedback.notify.success).not.toHaveBeenCalled()
    expect(posts()).toHaveLength(1)
  })

  it.each(['SIGNATURE_IMAGE_INVALID', 'VALIDATION_FAILED'])('shows actionable backend file validation for %s', async (code) => {
    postReply.mockResolvedValue({ status: 422, code, fields: { file: ['Berkas gambar rusak atau tidak didukung.'] } })
    await mount(); await choose()
    button('Simpan aset').click(); await settle()
    expect(host.textContent).toContain('Berkas gambar rusak atau tidak didukung.')
    await choose('upload', new File(['replacement'], 'replacement.png', { type: 'image/png' }))
    expect(host.textContent).not.toContain('Berkas gambar rusak atau tidak didukung.')
    expect(preview()).not.toBeNull()
  })

  it('preserves the file and preview on network failure and allows a manual retry', async () => {
    postReply.mockRejectedValueOnce(new AxiosError('private network details', 'ERR_NETWORK'))
    await mount(); const file = await choose()
    const image = preview()
    button('Simpan aset').click(); await settle()
    expect(host.textContent).toContain('Hasil permintaan belum dapat dipastikan.')
    expect(host.textContent).not.toContain('bukan tanda tangan')
    expect(preview()).toBe(image)
    expect(posts()).toHaveLength(1)
    button('Simpan aset').click(); await settle()
    expect(posts()).toHaveLength(2)
    const retriedFile = (posts()[1]!.data as FormData).get('file') as File
    expect(retriedFile).toMatchObject({ name: file.name, size: file.size, type: file.type })
    expect(await retriedFile.text()).toBe(await file.text())
    expect(feedback.notify.success).toHaveBeenCalledOnce()
  })

  it('allows retrying a rejected upload without reselecting the file', async () => {
    postReply.mockResolvedValueOnce({ status: 422, code: 'SIGNATURE_IMAGE_UNCERTAIN' })
    await mount(); const file = await choose()
    button('Simpan aset').click(); await settle()
    expect(preview()).not.toBeNull()
    button('Simpan aset').click(); await settle()
    expect(posts()).toHaveLength(2)
    const retriedFile = (posts()[1]!.data as FormData).get('file') as File
    expect(retriedFile.name).toBe(file.name)
    expect(await retriedFile.text()).toBe(await file.text())
    expect(feedback.notify.success).toHaveBeenCalledOnce()
    expect(preview()).toBeNull()
  })

  it('keeps the preview visible, shows verification and blocks repeated clicks until settlement', async () => {
    const pending = deferred<Reply>()
    postReply.mockReturnValue(pending.promise)
    await mount(); await choose()
    const image = preview(), submit = button('Simpan aset')
    submit.click(); submit.click(); await settle()
    expect(feedback.confirmAction).toHaveBeenCalledOnce()
    expect(posts()).toHaveLength(1)
    expect(submit.disabled).toBe(true)
    expect(submit.getAttribute('aria-busy')).toBe('true')
    expect(submit.textContent).toContain('Memverifikasi tanda tangan...')
    expect(submit.querySelector('.animate-spin')).not.toBeNull()
    expect(host.querySelector('fieldset')?.disabled).toBe(true)
    expect(preview()).toBe(image)
    submit.dispatchEvent(new MouseEvent('click')); await settle()
    expect(posts()).toHaveLength(1)
    pending.resolve({ status: 422, code: 'SIGNATURE_IMAGE_UNCERTAIN' }); await settle()
    expect(submit.disabled).toBe(false)
    expect(submit.textContent?.trim()).toBe('Simpan aset')
    expect(host.querySelector('fieldset')?.disabled).toBe(false)
  })

  it.each(['120', new Date(Date.now() + 120000).toUTCString()])('respects Retry-After %s and allows retry after the deadline', async (header) => {
    postReply.mockResolvedValueOnce({ status: 429, code: 'TOO_MANY_REQUESTS', headers: { 'retry-after': header } })
    await mount(); await choose()
    button('Simpan aset').click(); await settle()
    expect(host.textContent).toContain('Coba lagi dalam')
    button('Simpan aset').click(); await settle()
    expect(posts()).toHaveLength(1)
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 121000)
    button('Simpan aset').click(); await settle()
    expect(posts()).toHaveLength(2)
    expect(feedback.notify.success).toHaveBeenCalledOnce()
  })

  it('retains the existing single CSRF refresh retry for 419', async () => {
    postReply.mockResolvedValueOnce({ status: 419, code: 'CSRF_TOKEN_MISMATCH' })
    await mount(); await choose()
    button('Simpan aset').click(); await settle()
    expect(calls.filter((call) => call.url?.endsWith('/sanctum/csrf-cookie'))).toHaveLength(2)
    expect(posts()).toHaveLength(2)
    expect(posts()[1]!.data).toBe(posts()[0]!.data)
    expect(posts()[1]!.timeout).toBe(75000)
    expect(feedback.notify.success).toHaveBeenCalledOnce()
  })

  it('does not submit if confirmation resolves after unmount', async () => {
    const confirmation = deferred<boolean>()
    feedback.confirmAction.mockReturnValue(confirmation.promise)
    await mount(); await choose()
    button('Simpan aset').click(); await settle()
    app!.unmount(); app = undefined
    confirmation.resolve(true); await settle()
    expect(posts()).toHaveLength(0)
  })

  it.each([true, false])('aborts on unmount and ignores a late %s response', async (success) => {
    const pending = deferred<Reply>()
    postReply.mockReturnValue(pending.promise)
    const selected = await mount(true); await choose()
    button('Simpan aset').click(); await settle()
    const signal = posts()[0]!.signal
    app!.unmount(); app = undefined
    expect(signal?.aborted).toBe(true)
    pending.resolve(success ? { status: 201 } : { status: 503, code: 'SIGNATURE_CLASSIFIER_UNAVAILABLE' })
    await settle()
    expect(feedback.notify.error).not.toHaveBeenCalled()
    expect(feedback.notify.success).not.toHaveBeenCalled()
    expect(selected).not.toHaveBeenCalled()
    expect(calls.filter((call) => call.url?.endsWith('/signature-assets') && call.method === 'get')).toHaveLength(1)
  })

  it('translates verification feedback using the existing workspace language', async () => {
    const pending = deferred<Reply>()
    postReply.mockReturnValue(pending.promise)
    await mount(); await choose()
    button('Simpan aset').click(); await settle()
    setWorkspaceLanguage('en'); setWorkspaceActive(true); await settle()
    expect(host.textContent).toContain('Verifying signature...')
    pending.resolve({ status: 503, code: 'SIGNATURE_CLASSIFIER_UNAVAILABLE' }); await settle()
    expect(host.textContent).toContain('Verification is temporarily unavailable.')
  })

  it('keeps the saved-asset lightbox and real deletion confirmation working', async () => {
    vi.useFakeTimers()
    saved = [asset]
    await mount()
    const feedbackRoot = document.createElement('div')
    host.append(feedbackRoot)
    feedbackApp = createApp(InteractionHost)
    feedbackApp.mount(feedbackRoot)
    const realFeedback = await vi.importActual<typeof import('../src/services/feedback')>('../src/services/feedback')
    feedback.confirmAction.mockImplementation(realFeedback.confirmAction)
    host.querySelector<HTMLButtonElement>('[aria-label="Pratinjau tanda tangan"]')!.click(); await settle()
    expect(host.querySelector<HTMLDialogElement>('.signature-preview-dialog')?.open).toBe(true)
    host.querySelector<HTMLButtonElement>('button[aria-label="Tutup"]')!.click(); await settle()
    expect(host.querySelector('.signature-preview-dialog')).toBeNull()
    host.querySelector<HTMLButtonElement>('[aria-label="Hapus tanda tangan"]')!.click(); await settle()
    expect(confirmation.value?.danger).toBe(true)
    expect(host.querySelector<HTMLDialogElement>('.confirmation-dialog')?.open).toBe(true)
    expect(calls.filter((call) => call.method === 'delete')).toHaveLength(0)
    button('Batal').click(); await settle(); await vi.advanceTimersByTimeAsync(180); await settle()
    expect(host.querySelectorAll('article')).toHaveLength(1)
    expect(calls.filter((call) => call.method === 'delete')).toHaveLength(0)
    host.querySelector<HTMLButtonElement>('[aria-label="Hapus tanda tangan"]')!.click(); await settle()
    button('Ya, Hapus').click(); await settle(); await vi.advanceTimersByTimeAsync(180); await settle()
    expect(calls.filter((call) => call.method === 'delete')).toHaveLength(1)
    expect(host.querySelectorAll('article')).toHaveLength(0)
    expect(host.textContent).toContain('0 aset tersimpan')
  })
})

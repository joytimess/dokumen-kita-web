// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, type App } from 'vue'
import { createPinia } from 'pinia'
import { AxiosError } from 'axios'
import SignaturePad from 'signature_pad'
import SignatureCanvas from '../src/components/signatures/SignatureCanvas.vue'
import AssetLibrary from '../src/components/signatures/AssetLibrary.vue'

const mocks = vi.hoisted(() => ({ confirmAction: vi.fn(), notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() }, uploadAsset: vi.fn(), assets: vi.fn(), assetImage: vi.fn() }))
vi.mock('../src/services/feedback', () => ({ confirmAction: mocks.confirmAction, notify: mocks.notify }))
vi.mock('../src/services/documents.service', () => ({ documentsApi: { uploadAsset: mocks.uploadAsset, assets: mocks.assets, assetImage: mocks.assetImage } }))
let app: App | undefined
let host: HTMLDivElement
let bounds = { width: 800, height: 300, left: 20, top: 40 }
let observer: { callback: () => void; disconnect: ReturnType<typeof vi.fn> }
let resolution: MediaQueryList
const contexts = new Map<HTMLCanvasElement, ReturnType<typeof context>>()
function context() {
  let painted = false
  return {
    setTransform: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    save: vi.fn(), restore: vi.fn(), stroke: vi.fn(() => { painted = true }),
    arc: vi.fn(() => { painted = true }), fill: vi.fn(), fillRect: vi.fn(),
    clearRect: vi.fn(() => { painted = false }),
    drawImage: vi.fn(() => { painted = true }),
    getImageData: vi.fn((_x: number, _y: number, width: number, height: number) => {
      const data = new Uint8ClampedArray(width * height * 4)
      if (painted) for (let x = 20; x < 30; x++) data.set([23, 76, 60, 255], (width * 10 + x) * 4)
      return { data }
    }),
  }
}
async function settle() { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
function mount(library = false) {
  host = document.createElement('div'); document.body.append(host)
  const created = vi.fn()
  const props = reactive({ active: true, disabled: false })
  app = library ? createApp(AssetLibrary, { standalone: true }) : createApp({ setup: () => () => h(SignatureCanvas, { ...props, onCreated: created }) })
  app.use(createPinia()); app.mount(host)
  return { canvas: host.querySelector('canvas')!, created, props }
}
function button(text: string) {
  return Array.from(host.querySelectorAll('button')).find((item) => {
    const copy = item.cloneNode(true) as HTMLElement
    copy.querySelectorAll('[aria-hidden="true"]').forEach((element) => element.remove())
    return copy.textContent?.trim() === text
  })!
}
function pointer(canvas: HTMLCanvasElement, type: string, x: number, y: number, pointerType = 'mouse', down = true) {
  const target = type === 'pointerdown' ? canvas : window
  target.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType, clientX: x + bounds.left, clientY: y + bounds.top, button: type === 'pointerdown' ? 0 : -1, buttons: down ? 1 : 0, bubbles: true, cancelable: true }))
}
function draw(canvas: HTMLCanvasElement, kind = 'mouse', interval = 20) {
  pointer(canvas, 'pointerdown', 50, 80, kind)
  for (let i = 1; i <= 20; i++) {
    vi.advanceTimersByTime(interval)
    pointer(canvas, 'pointermove', 50 + i * 12, 80 + Math.sin(i / 3) * 40, kind)
  }
  pointer(canvas, 'pointerup', 300, 90, kind, false)
  vi.advanceTimersByTime(20)
}
function data() { return vi.mocked(SignaturePad.prototype.fromData).mock.instances.at(-1)!.toData() }

beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); contexts.clear()
  bounds = { width: 800, height: 300, left: 20, top: 40 }
  vi.stubGlobal('devicePixelRatio', 2)
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ ...bounds, x: bounds.left, y: bounds.top, right: bounds.left + bounds.width, bottom: bounds.top + bounds.height, toJSON: () => ({}) }))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    if (!contexts.has(this)) contexts.set(this, context())
    return contexts.get(this) as unknown as CanvasRenderingContext2D
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['png'], { type: 'image/png' })))
  vi.spyOn(SignaturePad.prototype, 'toData')
  vi.spyOn(SignaturePad.prototype, 'fromData')
  vi.spyOn(SignaturePad.prototype, 'on')
  vi.spyOn(SignaturePad.prototype, 'off')
  vi.stubGlobal('ResizeObserver', class {
    disconnect = vi.fn()
    observe = vi.fn()
    constructor(callback: () => void) { observer = { callback, disconnect: this.disconnect } }
  })
  vi.spyOn(window, 'matchMedia').mockImplementation((media) => {
    resolution = Object.assign(new EventTarget(), { media, matches: true }) as MediaQueryList
    vi.spyOn(resolution, 'removeEventListener')
    return resolution
  })
  mocks.confirmAction.mockResolvedValue(true)
  mocks.assets.mockResolvedValue({ data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 6 }, links: { prev: null, next: null } })
})
afterEach(() => { app?.unmount(); app = undefined; host?.remove(); vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('SignatureCanvas with real signature_pad and simulated canvas context', () => {
  it.each([['mouse', 30], ['mouse', 2], ['touch', 16], ['pen', 10]] as const)('records continuous %s strokes sampled at %ims', async (kind, interval) => {
    const { canvas } = mount()
    draw(canvas, kind, interval); await settle()
    window.dispatchEvent(new Event('resize'))
    const strokes = vi.mocked(SignaturePad.prototype.toData).mock.instances[0]!.toData()
    expect(strokes).toHaveLength(1)
    expect(strokes[0]!.points.length).toBeGreaterThan(3)
    expect(strokes[0]!.points[0]).toMatchObject({ x: 50, y: 80 })
    expect(strokes[0]).toMatchObject({ minWidth: 1.5, maxWidth: 3, penColor: '#000000', velocityFilterWeight: 0.7 })
    expect(contexts.get(canvas)!.arc.mock.calls.length).toBeGreaterThan(20)
    expect(button('Gunakan tanda tangan').disabled).toBe(false)
  })
  it('recolors existing and new strokes without losing their shape, including after resizing', async () => {
    const { canvas, created } = mount()
    expect(button('Hitam').getAttribute('aria-pressed')).toBe('true')
    draw(canvas); await settle()
    const original = structuredClone(data())
    bounds.width = 400; bounds.height = 150; observer.callback()
    button('Biru Tinta').click(); await settle()
    expect(button('Biru Tinta').getAttribute('aria-pressed')).toBe('true')
    expect(data()[0]!.penColor).toBe('#1D4ED8')
    bounds.width = 800; bounds.height = 300; observer.callback()
    expect(data()[0]!.points).toEqual(original[0]!.points)
    expect(data()[0]!.penColor).toBe('#1D4ED8')
    draw(canvas); await settle()
    button('Biru Tua').click(); await settle()
    expect(data().map((stroke) => stroke.penColor)).toEqual(['#17365D', '#17365D'])
    button('Gunakan tanda tangan').click(); await settle()
    const output = vi.mocked(HTMLCanvasElement.prototype.toBlob).mock.instances.at(-1)!
    expect(contexts.get(output)!.drawImage).toHaveBeenCalledWith(canvas, expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number))
    expect(contexts.get(output)!.fillRect).not.toHaveBeenCalled()
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }))
  })
  it('uses HiDPI dimensions without changing pointer coordinates and restores strokes uniformly after resizing', async () => {
    const { canvas } = mount(); draw(canvas); await settle()
    expect(canvas.width).toBe(1600); expect(canvas.height).toBe(600)
    expect(contexts.get(canvas)!.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0)
    bounds.width = 400; bounds.height = 150; observer.callback()
    const reduced = data()
    expect(reduced[0]!.points[0]).toMatchObject({ x: 25, y: 40 })
    expect(reduced[0]!.minWidth).toBe(0.75)
    expect(canvas.width).toBe(800)
    bounds.width = 800; bounds.height = 300; observer.callback()
    expect(data()[0]!.points[0]).toMatchObject({ x: 50, y: 80 })
    expect(button('Gunakan tanda tangan').disabled).toBe(false)
  })
  it('defers resize during an active stroke until it ends', () => {
    const { canvas } = mount()
    pointer(canvas, 'pointerdown', 20, 30)
    bounds.width = 400; bounds.height = 150; observer.callback()
    expect(canvas.width).toBe(1600)
    pointer(canvas, 'pointerup', 40, 60, 'mouse', false)
    expect(canvas.width).toBe(800)
    expect(data()[0]!.points[0]).toMatchObject({ x: 10, y: 15 })
  })
  it('fits changing desktop/mobile aspect ratios uniformly and restores the original strokes on return', async () => {
    const { canvas } = mount(); draw(canvas); await settle()
    const original = structuredClone(data())
    bounds.width = 360; bounds.height = 240; observer.callback()
    expect(data()[0]!.points[0]).toMatchObject({ x: 22.5, y: 36 })
    expect(data()[0]!.minWidth).toBeCloseTo(original[0]!.minWidth * 0.45)
    bounds.width = 800; bounds.height = 200; observer.callback()
    expect(data()[0]!.points[0]!.x).toBeCloseTo(50 * 2 / 3)
    expect(data()[0]!.points[0]!.y).toBeCloseTo(80 * 2 / 3)
    bounds.height = 300; observer.callback()
    expect(data()).toEqual(original)
    bounds.width = 360; bounds.height = 240; observer.callback()
    draw(canvas, 'touch'); await settle()
    bounds.width = 800; bounds.height = 300; observer.callback()
    expect(data()).toHaveLength(2)
    button('Hapus coretan').click(); await settle()
    bounds.width = 360; bounds.height = 240; observer.callback()
    expect(data()).toHaveLength(0)
    expect(button('Gunakan tanda tangan').disabled).toBe(true)
  })
  it('records a closed curved stroke and recovers after pointer cancellation', async () => {
    const { canvas } = mount()
    pointer(canvas, 'pointerdown', 250, 150, 'pen')
    for (let i = 1; i <= 36; i++) {
      vi.advanceTimersByTime(20)
      pointer(canvas, 'pointermove', 150 + Math.cos(i * Math.PI / 18) * 100, 150 + Math.sin(i * Math.PI / 18) * 100, 'pen')
    }
    pointer(canvas, 'pointercancel', 250, 150, 'pen', false)
    draw(canvas); await settle()
    expect(data()).toHaveLength(2)
    const points = data()[0]!.points
    expect(points[0]).toMatchObject({ x: 250, y: 150 })
    expect(points.at(-1)!.x).toBeCloseTo(250)
    expect(points.at(-1)!.y).toBeCloseTo(150)
    expect(contexts.get(canvas)!.arc.mock.calls.every((call) => call.slice(0, 5).every(Number.isFinite))).toBe(true)
  })
  it('preserves strokes through hidden tabs, disabled states and devicePixelRatio changes', async () => {
    const { canvas, props } = mount(); draw(canvas); await settle()
    props.active = false; await settle()
    bounds.width = 0; bounds.height = 0; observer.callback()
    expect(canvas.width).toBe(1600)
    const oldRatio = resolution
    vi.stubGlobal('devicePixelRatio', 3)
    bounds.width = 800; bounds.height = 300
    oldRatio.dispatchEvent(new Event('change'))
    expect(canvas.width).toBe(2400)
    props.active = true; await settle()
    expect(button('Gunakan tanda tangan').disabled).toBe(false)
    props.disabled = true; await settle()
    expect(button('Gunakan tanda tangan').disabled).toBe(true)
    props.disabled = false; await settle()
    expect(SignaturePad.prototype.on).toHaveBeenCalledTimes(3)
    expect(SignaturePad.prototype.off).toHaveBeenCalledTimes(2)
    expect(oldRatio.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
  it('preserves clear confirmation, rejects blank export, and permits drawing again', async () => {
    const { canvas, created } = mount()
    expect(button('Gunakan tanda tangan').disabled).toBe(true)
    expect(button('Hapus coretan').disabled).toBe(true)
    draw(canvas); await settle()
    expect(button('Hapus coretan').disabled).toBe(false)
    mocks.confirmAction.mockResolvedValueOnce(false)
    button('Hapus coretan').click(); await settle()
    expect(button('Gunakan tanda tangan').disabled).toBe(false)
    button('Hapus coretan').click(); await settle()
    expect(mocks.confirmAction).toHaveBeenCalledWith('Hapus coretan tanda tangan ini?', expect.objectContaining({ danger: true }))
    expect(button('Gunakan tanda tangan').disabled).toBe(true)
    expect(button('Hapus coretan').disabled).toBe(true)
    button('Gunakan tanda tangan').dispatchEvent(new MouseEvent('click')); await settle()
    expect(created).not.toHaveBeenCalled()
    draw(canvas); await settle()
    button('Gunakan tanda tangan').click(); await settle()
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ name: 'tanda-tangan.png', type: 'image/png' }))
  })
  it('caps PNG export dimensions and reports a failed export without losing strokes', async () => {
    bounds.width = 1200; bounds.height = 450; vi.stubGlobal('devicePixelRatio', 3)
    const { canvas, created } = mount(); draw(canvas); await settle()
    contexts.get(canvas)!.getImageData.mockReturnValue({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255) })
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => callback(null))
    button('Gunakan tanda tangan').click(); await settle()
    expect(created).not.toHaveBeenCalled()
    expect(mocks.notify.error).toHaveBeenCalledWith('Coretan gagal diproses. Silakan coba lagi.')
    button('Gunakan tanda tangan').click(); await settle()
    const exportCanvas = vi.mocked(HTMLCanvasElement.prototype.toBlob).mock.instances.at(-1)!
    expect(exportCanvas.width).toBe(2048)
    expect(exportCanvas.height).toBeLessThanOrEqual(1024)
    const call = contexts.get(exportCanvas)!.drawImage.mock.calls[0]!
    expect(Number(call[7]) / canvas.width).toBeCloseTo(Number(call[8]) / canvas.height)
    expect(created).toHaveBeenCalledTimes(1)
  })
  it('crops to nontransparent pixels with transparent padding without changing strokes or their aspect ratio', async () => {
    const { canvas, created } = mount(); draw(canvas); await settle()
    const original = structuredClone(data())
    const pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4)
    for (let x = 200; x < 400; x++) pixels.set([23, 76, 60, 255], (100 * canvas.width + x) * 4)
    // Include faint edge pixels in the crop instead of clipping antialiased ink.
    pixels.set([23, 76, 60, 1], (149 * canvas.width + 399) * 4)
    contexts.get(canvas)!.getImageData.mockReturnValue({ data: pixels })
    button('Gunakan tanda tangan').click(); await settle()
    const output = vi.mocked(HTMLCanvasElement.prototype.toBlob).mock.instances.at(-1)!
    const exported = contexts.get(output)!
    expect(output.width).toBe(248)
    expect(output.height).toBe(98)
    expect(exported.drawImage).toHaveBeenCalledWith(canvas, 200, 100, 200, 50, 24, 24, 200, 50)
    expect(exported.fillRect).not.toHaveBeenCalled()
    expect(exported.fill).not.toHaveBeenCalled()
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png')
    expect(created).toHaveBeenCalledWith(expect.objectContaining({ name: 'tanda-tangan.png', type: 'image/png' }))
    expect(data()).toEqual(original)
  })
  it('keeps transparent padding for strokes drawn against the canvas edges', async () => {
    const { canvas } = mount(); draw(canvas); await settle()
    const pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4)
    for (let x = 0; x < 10; x++) pixels.set([23, 76, 60, 255], x * 4)
    pixels.set([23, 76, 60, 255], pixels.length - 4)
    contexts.get(canvas)!.getImageData.mockReturnValue({ data: pixels })
    button('Gunakan tanda tangan').click(); await settle()
    const output = vi.mocked(HTMLCanvasElement.prototype.toBlob).mock.instances.at(-1)!
    expect(contexts.get(output)!.drawImage).toHaveBeenCalledWith(canvas, 0, 0, 1600, 600, 24, 24, 1600, 600)
    expect(output.width).toBe(1648)
    expect(output.height).toBe(648)
  })
  it('disconnects observers, DPR and pointer listeners and ignores a late PNG export after unmount', async () => {
    const { canvas, created } = mount(); draw(canvas); await settle()
    let complete!: BlobCallback
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((callback) => { complete = callback })
    button('Gunakan tanda tangan').click()
    const oldResolution = resolution
    app!.unmount(); app = undefined
    expect(observer.disconnect).toHaveBeenCalledOnce()
    expect(SignaturePad.prototype.off).toHaveBeenCalledOnce()
    expect(oldResolution.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    const arcs = contexts.get(canvas)!.arc.mock.calls.length
    draw(canvas)
    expect(contexts.get(canvas)!.arc).toHaveBeenCalledTimes(arcs)
    complete(new Blob(['late'], { type: 'image/png' }))
    expect(created).not.toHaveBeenCalled()
  })
  it('retains the asset preview, confirmation, PNG upload contract, saved tab and reopening preview', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:asset')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(function (this: HTMLImageElement) { this.width = 1600; this.height = 600; return Promise.resolve() })
    const asset = { guid: 'new', source_type: 'drawn', width: 1600, height: 600 }
    mocks.uploadAsset.mockResolvedValue(asset)
    mocks.assetImage.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
    const { canvas } = mount(true); await settle()
    button('Coretan langsung').click(); await settle()
    draw(canvas); await settle()
    button('Aset tersimpan').click(); await settle()
    button('Coretan langsung').click(); await settle()
    expect(button('Gunakan tanda tangan').disabled).toBe(false)
    button('Gunakan tanda tangan').click(); await settle()
    expect(host.textContent).toContain('Preview aset baru')
    mocks.assets.mockResolvedValue({ data: [asset], meta: { total: 1, current_page: 1, last_page: 1, per_page: 6 }, links: { prev: null, next: null } })
    button('Simpan aset').click(); await settle()
    expect(mocks.confirmAction).toHaveBeenCalledWith('Simpan gambar ini sebagai aset tanda tangan?', expect.any(Object))
    expect(mocks.uploadAsset).toHaveBeenCalledWith(expect.objectContaining({ name: 'tanda-tangan.png', type: 'image/png' }), 'drawn', expect.any(AbortSignal))
    expect(host.querySelector('#signature-tab-saved')?.getAttribute('aria-selected')).toBe('true')
    host.querySelector<HTMLButtonElement>('button[aria-label="Pratinjau tanda tangan"]')!.click(); await settle()
    expect(host.querySelector('dialog')?.open).toBe(true)
  })
  it.each(['mouse', 'touch'])('preserves real %s strokes after classification rejection and allows editing and retry', async (kind) => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:asset')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(function (this: HTMLImageElement) { this.width = 1600; this.height = 600; return Promise.resolve() })
    let reject!: (error: Error) => void
    mocks.uploadAsset.mockReturnValueOnce(new Promise((_, no) => { reject = no }))
    const { canvas } = mount(true); await settle()
    button('Coretan langsung').click(); await settle()
    button('Biru Tinta').click(); await settle()
    draw(canvas, kind); await settle()
    const original = structuredClone(data())
    button('Gunakan tanda tangan').click(); await settle()
    const image = host.querySelector('img[alt="Preview aset baru"]')
    button('Simpan aset').click(); await settle()
    const verifying = host.querySelectorAll<HTMLButtonElement>('button[aria-busy="true"]')
    expect(verifying).toHaveLength(2)
    for (const control of verifying) {
      expect(control.disabled).toBe(true)
      expect(control.textContent).toContain('Memverifikasi tanda tangan...')
      expect(control.querySelector('.animate-spin')).not.toBeNull()
    }
    expect(host.querySelector('canvas')).toBe(canvas)
    expect(data()).toEqual(original)
    expect(button('Biru Tinta').getAttribute('aria-pressed')).toBe('true')
    reject(new AxiosError('private details', undefined, undefined, undefined, {
      status: 422, data: { error: { code: 'SIGNATURE_IMAGE_NOT_SIGNATURE' } }, headers: {},
    } as never))
    await settle()
    expect(host.textContent).toContain('Gambar bukan tanda tangan.')
    expect(host.querySelector('canvas')).toBe(canvas)
    expect(data()).toEqual(original)
    expect(host.querySelector('img[alt="Preview aset baru"]')).toBe(image)
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    expect(button('Gunakan tanda tangan').disabled).toBe(false)
    draw(canvas, kind); await settle()
    expect(data()).toHaveLength(2)
    button('Gunakan tanda tangan').click(); await settle()
    mocks.uploadAsset.mockResolvedValueOnce({ guid: 'retry', source_type: 'drawn' })
    button('Simpan aset').click(); await settle()
    expect(mocks.uploadAsset).toHaveBeenCalledTimes(2)
    expect(mocks.notify.success).toHaveBeenCalledWith('Aset tanda tangan tersimpan.')
    button('Coretan langsung').click(); await settle()
    expect(host.querySelector('canvas')).not.toBe(canvas)
    expect(button('Hitam').getAttribute('aria-pressed')).toBe('true')
    expect(button('Gunakan tanda tangan').disabled).toBe(true)
  })
})

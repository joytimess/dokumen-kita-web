// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import PdfViewer from '../src/components/documents/PdfViewer.vue'

const mocks = vi.hoisted(() => ({
  pdf: vi.fn(), startOcr: vi.fn(), getDocument: vi.fn(), render: vi.fn(),
  destroy: vi.fn(), cancel: vi.fn(), textRender: vi.fn(), textCancel: vi.fn(),
}))
vi.mock('../src/services/documents.service', () => ({ documentsApi: mocks }))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  GlobalWorkerOptions: {}, getDocument: mocks.getDocument,
  TextLayer: class {
    textDivs: HTMLElement[] = []
    render = mocks.textRender
    cancel = mocks.textCancel
  },
}))

let app: App | undefined, host: HTMLDivElement
let containerWidth = 366, pageWidth = 595, pageHeight = 842
let resizeCallback: () => void
const gates = vi.fn(), failures = vi.fn(), placed = vi.fn()
async function settle() { for (let i = 0; i < 20; i++) { await Promise.resolve(); await nextTick() } }
function mount(editable = false) {
  host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h(PdfViewer, { versionGuid: 'version', expectedHash: 'a'.repeat(64), editable, onGate: gates, onFailure: failures, onPlace: placed }) })
  app.mount(host)
}
beforeEach(() => {
  vi.resetAllMocks()
  containerWidth = 366; pageWidth = 595; pageHeight = 842
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => containerWidth)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as CanvasRenderingContext2D)
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resizeCallback = callback }
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
  mocks.pdf.mockResolvedValue({ data: new Uint8Array([1]), hash: 'a'.repeat(64) })
  mocks.startOcr.mockResolvedValue({ processing_status: 'unavailable', failed_pages: [] })
  mocks.textRender.mockResolvedValue(undefined)
  mocks.render.mockImplementation(() => ({ promise: Promise.resolve(), cancel: mocks.cancel }))
  mocks.getDocument.mockReturnValue({
    destroy: mocks.destroy,
    promise: Promise.resolve({ numPages: 1, getPage: async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: pageWidth * scale, height: pageHeight * scale }),
      render: mocks.render, getTextContent: async () => ({ items: [] }),
    }) }),
  })
})
afterEach(() => {
  app?.unmount(); app = undefined
  host?.remove()
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

describe('PDF viewer rendering lifecycle', () => {
  it.each([360, 375, 390, 430, 1440])('fits a %ipx container and keeps bitmap resolution within budget', async (width) => {
    containerWidth = width
    mount(); await settle()
    const target = host.querySelector('canvas')!
    expect(parseFloat(target.parentElement!.style.width)).toBeCloseTo(width - 24)
    if (width < 500) expect(target.width).toBe(Math.floor((width - 24) * 2))
    expect(target.width * target.height).toBeLessThanOrEqual(5_242_880)
    expect(failures).not.toHaveBeenCalled()
    resizeCallback(); await settle()
    expect(mocks.render).toHaveBeenCalledTimes(1)
  })
  it('bounds long-page bitmap dimensions without changing the CSS page geometry', async () => {
    pageHeight = 10000
    mount(); await settle()
    const target = host.querySelector('canvas')!
    expect(target.height).toBeLessThanOrEqual(4096)
    expect(target.width * target.height).toBeLessThanOrEqual(5_242_880)
    expect(parseFloat(target.parentElement!.style.height)).toBeCloseTo(10000 * (366 - 24) / 595)
  })
  it('waits for a visible container instead of rendering an invalid or oversized page', async () => {
    containerWidth = 0
    mount(); await settle()
    expect(mocks.render).not.toHaveBeenCalled()
    expect(failures).not.toHaveBeenCalled()
    containerWidth = 360; resizeCallback(); await settle()
    expect(mocks.render).toHaveBeenCalledTimes(1)
  })
  it('clears a genuine render failure on retry and keeps placement blocked while failed', async () => {
    mocks.render.mockReturnValueOnce({ promise: Promise.reject(new Error('canvas failed')), cancel: mocks.cancel })
    mount(true); await settle()
    expect(host.textContent).toContain('Halaman PDF belum dapat dimuat')
    host.querySelector('canvas')!.parentElement!.click()
    expect(placed).not.toHaveBeenCalled()
    const retry = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Coba muat lagi'))!
    retry.click(); await settle()
    expect(host.textContent).not.toContain('Halaman PDF belum dapat dimuat')
    expect(host.querySelector('canvas')!.classList.contains('invisible')).toBe(false)
    expect(mocks.pdf).toHaveBeenCalledTimes(1)
  })
  it('ignores a cancelled render during resize and uses the latest viewport', async () => {
    let reject!: (error: Error) => void
    const promise = new Promise<void>((_, fail) => { reject = fail })
    mocks.render.mockReturnValueOnce({ promise, cancel: () => reject(new Error('cancelled')) })
    mount(); await settle()
    containerWidth = 430; resizeCallback(); await settle()
    expect(failures).not.toHaveBeenCalled()
    expect(host.textContent).not.toContain('Halaman PDF belum dapat dimuat')
    expect(parseFloat(host.querySelector('canvas')!.parentElement!.style.width)).toBe(406)
  })
  it('releases the loading task and canvas when unmounted', async () => {
    mount(); await settle()
    const target = host.querySelector('canvas')!
    app!.unmount(); app = undefined
    expect(mocks.destroy).toHaveBeenCalled()
    expect(mocks.cancel).toHaveBeenCalled()
    expect(target.width * target.height).toBe(0)
  })
})

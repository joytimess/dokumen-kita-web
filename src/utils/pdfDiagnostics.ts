export type PdfRenderStage = 'get-page' | 'viewport' | 'canvas-context' | 'canvas-render' | 'text-content' | 'text-layer' | 'highlight' | 'read-observer'

// Temporary diagnostics. Never serialize the exception, PDF, request or full URL.
export function pdfRenderDiagnostic(cause: unknown, stage: PdfRenderStage, runtime: {
  version: string
  build: string
  worker: string
  viewer: string
  canvasWidth: number
  canvasHeight: number
}) {
  const error = cause as { name?: unknown; message?: unknown; stack?: unknown } | null
  const message = typeof error?.message === 'string' ? error.message : ''
  const names = ['Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'InvalidStateError', 'NotSupportedError', 'SecurityError', 'DataCloneError', 'QuotaExceededError', 'UnknownErrorException']
  let signature = 'unclassified (inspect caught exception locally)'
  if (message === 'PDF canvas context unavailable') signature = 'canvas-context-unavailable'
  else if (/not async iterable|Symbol\.asyncIterator/.test(message)) signature = 'readable-stream-async-iterator'
  else if (/canvas.*(?:area|size|memory)|out of memory/i.test(message)) signature = 'canvas-size-or-memory'
  else if (/API version.*does not match.*Worker version/.test(message)) signature = 'api-worker-version-mismatch'
  else {
    const api = /\b(OffscreenCanvas|ImageDecoder|ImageBitmap|DOMMatrix|Path2D|ReadableStream|Promise\.withResolvers|Promise\.try|Map\.prototype\.getOrInsertComputed|getOrInsertComputed|Uint8Array\.fromBase64)\b/.exec(message)?.[1]
    if (api && /not (?:a function|defined|supported)|undefined|not available|Can't find variable/i.test(message)) signature = `unavailable-api:${api}`
  }
  const asset = (url: string) => /(?:^|\/)((?:PdfViewer-[\w-]+\.js|pdf\.worker(?:\.min)?(?:-[\w-]+)?\.mjs))(?:$|[?#])/.exec(url)?.[1] ?? 'development-or-unrecognized-asset'
  // Only generated code filenames and numeric locations; no message, function names or URL paths.
  const frames = typeof error?.stack === 'string'
    ? [...error.stack.matchAll(/\/(?:assets\/)?((?:PdfViewer-[\w-]+\.js|pdf\.worker(?:\.min)?(?:-[\w-]+)?\.mjs)):(\d+):(\d+)/g)]
      .filter((match) => [asset(runtime.viewer), asset(runtime.worker)].includes(match[1]!))
      .slice(0, 8).map((match) => `${match[1]}:${match[2]}:${match[3]}`)
    : []
  return JSON.stringify({
    diagnostic: 'pdf-webkit-1', stage,
    error: typeof error?.name === 'string' && names.includes(error.name) ? error.name : 'OtherError', signature, frames,
    pdfjs: { version: runtime.version, build: runtime.build, worker: asset(runtime.worker), viewer: asset(runtime.viewer) },
    canvas: { width: runtime.canvasWidth, height: runtime.canvasHeight, dpr: window.devicePixelRatio || 1 },
    capabilities: {
      offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
      imageDecoder: 'ImageDecoder' in globalThis,
      imageBitmap: typeof createImageBitmap === 'function',
      domMatrix: typeof DOMMatrix !== 'undefined',
      path2D: typeof Path2D !== 'undefined',
      readableStream: typeof ReadableStream !== 'undefined',
      readableStreamAsyncIterator: typeof ReadableStream !== 'undefined' && typeof Reflect.get(ReadableStream.prototype, Symbol.asyncIterator) === 'function',
      mapGetOrInsertComputed: 'getOrInsertComputed' in Map.prototype,
      promiseWithResolvers: 'withResolvers' in Promise,
    },
  }, null, 2)
}

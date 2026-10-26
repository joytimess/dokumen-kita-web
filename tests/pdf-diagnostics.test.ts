// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { pdfRenderDiagnostic } from '../src/utils/pdfDiagnostics'

const runtime = {
  version: '6.4.299', build: 'd0991a0d5', worker: '/assets/pdf.worker.min-Dkey6ZUl.mjs',
  viewer: 'https://example.test/assets/PdfViewer-abc.js', canvasWidth: 732, canvasHeight: 1035,
}
describe('safe temporary PDF diagnostics', () => {
  it('keeps only known asset locations and drops document, URL, token and exception fields', () => {
    const cause = {
      name: 'TypeError', message: 'private PDF text https://example.test/versions/private/pdf?token=secret',
      stack: 'TypeError: private PDF text\nrender@https://example.test/assets/PdfViewer-abc.js:1:42\nsecret@https://example.test/versions/private/pdf?token=secret:2:3\n/assets/PdfViewer-private.js:1:2',
      data: new Uint8Array([1]), token: 'secret',
    }
    const report = pdfRenderDiagnostic(cause, 'text-layer', runtime)
    expect(report).not.toMatch(/private|secret|https:|versions|Uint8Array/)
    expect(JSON.parse(report)).toMatchObject({
      diagnostic: 'pdf-webkit-1', stage: 'text-layer', error: 'TypeError',
      frames: ['PdfViewer-abc.js:1:42'], pdfjs: { worker: 'pdf.worker.min-Dkey6ZUl.mjs' },
    })
  })
  it.each([
    ['PDF canvas context unavailable', 'canvas-context-unavailable'],
    ['Total canvas memory use exceeds the maximum limit', 'canvas-size-or-memory'],
    ['OffscreenCanvas is not defined', 'unavailable-api:OffscreenCanvas'],
    ["Can't find variable: OffscreenCanvas", 'unavailable-api:OffscreenCanvas'],
    ['readableStream is not async iterable', 'readable-stream-async-iterator'],
    ['cache.getOrInsertComputed is not a function', 'unavailable-api:getOrInsertComputed'],
    ['The API version "1" does not match the Worker version "2"', 'api-worker-version-mismatch'],
    ['private document text', 'unclassified (inspect caught exception locally)'],
  ])('classifies evidence from the caught message: %s', (message, signature) => {
    expect(JSON.parse(pdfRenderDiagnostic(new Error(message), 'canvas-render', runtime)).signature).toBe(signature)
  })
  it.each([null, undefined, 'private text', { name: 'private text', message: 'secret' }])('handles non-Error throws without disclosure', (cause) => {
    const report = pdfRenderDiagnostic(cause, 'canvas-render', runtime)
    expect(JSON.parse(report).error).toBe('OtherError')
    expect(report).not.toMatch(/private|secret/)
  })
})

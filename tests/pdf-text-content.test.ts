import { describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFPageProxy, TextContent } from 'pdfjs-dist/types/src/display/api'
import { readPdfTextContent } from '../src/utils/pdfTextContent'

function fixturePdf() {
  const stream = 'BT /F1 18 Tf 30 800 Td (Synthetic iOS PDF text) Tj ET\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ]
  let source = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((object, index) => {
    offsets.push(source.length)
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = source.length
  source += `xref\n0 6\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  return new TextEncoder().encode(`${source}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
}

describe('PDF text content without ReadableStream async iteration', () => {
  it('reproduces the installed legacy failure and extracts identical text with getReader', async () => {
    const task = getDocument({ data: fixturePdf(), useSystemFonts: true })
    try {
      const pdf = await task.promise
      const page = await pdf.getPage(1)
      const expected = await page.getTextContent()
      const nativeStream = page.streamTextContent.bind(page)
      let lastStream!: ReadableStream
      page.streamTextContent = (...args) => {
        lastStream = nativeStream(...args)
        Object.defineProperty(lastStream, Symbol.asyncIterator, { value: undefined })
        return lastStream
      }
      await expect(page.getTextContent()).rejects.toThrow(TypeError)
      // Drain the failed method's untouched stream before destroying its worker.
      const reader = lastStream.getReader()
      try { while (!(await reader.read()).done) { /* drain */ } } finally { reader.releaseLock() }
      const actual = await readPdfTextContent(page)
      expect(actual).toEqual(expected)
      expect(actual.items.some(item => 'str' in item && item.str === 'Synthetic iOS PDF text')).toBe(true)
      expect(lastStream.locked).toBe(false)
    } finally {
      await task.destroy()
    }
  })

  it('merges all chunks and retains language, styles and item geometry', async () => {
    const item = { str: 'Signed page', dir: 'ltr', transform: [1, 0, 0, 1, 20, 30], width: 100, height: 18, fontName: 'font1', hasEOL: false }
    const style = { fontFamily: 'sans-serif', ascent: 0.8, descent: -0.2, vertical: false }
    const stream = new ReadableStream<TextContent>({ start(controller) {
      controller.enqueue({ lang: null, styles: {}, items: [] })
      controller.enqueue({ lang: 'id', styles: { font1: style }, items: [item] })
      controller.close()
    } })
    Object.defineProperty(stream, Symbol.asyncIterator, { value: undefined })
    const page = { streamTextContent: () => stream } as PDFPageProxy
    expect(await readPdfTextContent(page)).toEqual({ lang: 'id', styles: { font1: style }, items: [item] })
    expect(stream.locked).toBe(false)
  })

  it('propagates stream failures and releases the reader instead of accepting partial text', async () => {
    const cause = new Error('Synthetic text stream failed')
    const stream = new ReadableStream({ start(controller) { controller.error(cause) } })
    await expect(readPdfTextContent({ streamTextContent: () => stream } as PDFPageProxy)).rejects.toBe(cause)
    expect(stream.locked).toBe(false)
  })
})

import type { PDFPageProxy, TextContent } from 'pdfjs-dist/types/src/display/api'

export async function readPdfTextContent(page: PDFPageProxy): Promise<TextContent> {
  // PDF.js 6.4 getTextContent uses stream async iteration, which some iOS WebKit versions lack.
  const reader = page.streamTextContent().getReader()
  const text: TextContent = { items: [], styles: Object.create(null), lang: null }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return text
      text.lang ??= value.lang
      Object.assign(text.styles, value.styles)
      text.items.push(...value.items)
    }
  } finally {
    reader.releaseLock()
  }
}

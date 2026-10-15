import DOMPurify from 'dompurify'
import type { EditorData } from '../types/documents'
const clean = (value: unknown): string =>
  DOMPurify.sanitize(String(value ?? ''), {
    ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'mark', 'code', 'br', 'a'],
    ALLOWED_ATTR: ['href'],
    ALLOW_DATA_ATTR: false,
  })
function listItems(items: unknown[], depth = 1): unknown[] {
  if (!items.length) return []
  if (depth > 3 || items.length > 200)
    throw new Error('Daftar maksimal tiga tingkat dan 200 item per tingkat.')
  return items.map((item) =>
    typeof item === 'string'
      ? clean(item)
      : (item as { items?: unknown[] }).items?.length
        ? {
            content: clean((item as { content: unknown }).content),
            items: listItems((item as { items: unknown[] }).items, depth + 1),
          }
        : clean((item as { content: unknown }).content),
  )
}
export function editorPayload(data: EditorData): EditorData {
  if (data.blocks.length > 500) throw new Error('Dokumen maksimal 500 blok.')
  const blocks = data.blocks.map((block) => {
    const d = block.data
    if (block.type === 'paragraph') return { type: block.type, data: { text: clean(d.text) } }
    if (block.type === 'header')
      return {
        type: block.type,
        data: { text: clean(d.text), level: Math.max(1, Math.min(6, Number(d.level) || 2)) },
      }
    if (block.type === 'list')
      return {
        type: block.type,
        data: {
          style: d.style === 'ordered' ? 'ordered' : 'unordered',
          items: listItems(d.items as unknown[]),
        },
      }
    if (block.type === 'table')
      return {
        type: block.type,
        data: {
          withHeadings: !!d.withHeadings,
          showBorders: d.showBorders !== false,
          content: (d.content as unknown[][]).map((row) => row.map(clean)),
        },
      }
    if (block.type === 'image') {
      const url = (d.file as { url?: string })?.url ?? ''
      if (
        url.length > 700000 ||
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(url)
      )
        throw new Error('Gambar harus PNG/JPEG/WebP inline, maksimal sekitar 500 KB.')
      return { type: block.type, data: { file: { url }, caption: clean(d.caption) } }
    }
    throw new Error('Tipe blok tidak didukung backend.')
  })
  const output = { blocks }
  if (new TextEncoder().encode(JSON.stringify(output)).length > 1048576)
    throw new Error('Isi dokumen maksimal 1 MB.')
  return output
}

import type { EditorData } from '../types/documents'

export interface TiptapNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: { type: string; attrs?: Record<string, unknown> }[]
  content?: TiptapNode[]
}

const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;')

function blockText(value: unknown) {
  if (typeof value !== 'string') throw new Error('Isi blok dokumen tidak valid.')
  return value
}


function listHtml(items: unknown[], tag: 'ol' | 'ul'): string {
  return `<${tag}>${items.map((item) => {
    const value = typeof item === 'string' ? { content: item, items: [] } : item as { content: unknown; items?: unknown[] }
    return `<li><p>${blockText(value.content)}</p>${value.items?.length ? listHtml(value.items, tag) : ''}</li>`
  }).join('')}</${tag}>`
}

export function editorDataToHtml(data: EditorData): string {
  return data.blocks.map((block) => {
    const value = block.data
    switch (block.type) {
      case 'paragraph': return `<p>${blockText(value.text)}</p>`
      case 'header': {
        const level = Number(value.level)
        if (!Number.isInteger(level) || level < 1 || level > 6) throw new Error('Tingkat judul tidak didukung.')
        return `<h${level}>${blockText(value.text)}</h${level}>`
      }
      case 'list': return listHtml(value.items as unknown[], value.style === 'ordered' ? 'ol' : 'ul')
      case 'table': {
        const rows = value.content as unknown[][]
        const table = value.showBorders === false ? '<table data-show-borders="false">' : '<table>'
        return `${table}<tbody>${rows.map((row, index) => `<tr>${row.map((cell) => {
          const tag = value.withHeadings && index === 0 ? 'th' : 'td'
          return `<${tag}><p>${blockText(cell)}</p></${tag}>`
        }).join('')}</tr>`).join('')}</tbody></table>`
      }
      case 'image': {
        const src = (value.file as { url?: unknown })?.url
        if (typeof src !== 'string') throw new Error('Gambar dokumen tidak valid.')
        return `<img src="${escapeHtml(src)}" data-caption="${escapeHtml(blockText(value.caption))}">`
      }
      default: throw new Error('Tipe blok dokumen belum didukung Tiptap.')
    }
  }).join('') || '<p></p>'
}

function inlineHtml(nodes: TiptapNode[] = []): string {
  return nodes.map((node) => {
    if (node.type === 'hardBreak') return '<br>'
    if (node.type !== 'text' || typeof node.text !== 'string')
      throw new Error('Format teks ini belum dapat disimpan ke dokumen.')
    let html = escapeHtml(node.text)
    for (const mark of node.marks ?? []) {
      switch (mark.type) {
        case 'bold': html = `<b>${html}</b>`; break
        case 'italic': html = `<i>${html}</i>`; break
        case 'underline': html = `<u>${html}</u>`; break
        case 'code': html = `<code>${html}</code>`; break
        case 'highlight': html = `<mark>${html}</mark>`; break
        case 'link': {
          const href = mark.attrs?.href
          if (typeof href !== 'string' || !/^(https?:\/\/|mailto:)/i.test(href))
            throw new Error('Tautan harus memakai alamat HTTP, HTTPS, atau email.')
          html = `<a href="${escapeHtml(href)}">${html}</a>`
          break
        }
        default: throw new Error('Format teks ini belum dapat disimpan ke dokumen.')
      }
    }
    return html
  }).join('')
}

function listItems(node: TiptapNode, depth = 1): unknown[] {
  if (depth > 3) throw new Error('Daftar maksimal tiga tingkat.')
  return (node.content ?? []).map((item) => {
    if (item.type !== 'listItem') throw new Error('Struktur daftar tidak didukung.')
    const children = item.content ?? []
    if (children[0]?.type !== 'paragraph' || children.length > 2)
      throw new Error('Satu item daftar hanya boleh berisi satu paragraf dan satu subdaftar.')
    const nested = children[1]
    if (nested && nested.type !== node.type)
      throw new Error('Subdaftar harus memakai jenis nomor atau poin yang sama.')
    const content = inlineHtml(children[0].content)
    return nested ? { content, items: listItems(nested, depth + 1) } : content
  })
}

function tableData(node: TiptapNode) {
  const rows = (node.content ?? []).map((row) => {
    if (row.type !== 'tableRow') throw new Error('Struktur tabel tidak didukung.')
    return (row.content ?? []).map((cell) => {
      if (!['tableCell', 'tableHeader'].includes(cell.type) ||
          Number(cell.attrs?.colspan ?? 1) !== 1 || Number(cell.attrs?.rowspan ?? 1) !== 1 ||
          cell.content?.length !== 1 || cell.content[0]?.type !== 'paragraph')
        throw new Error('Sel tabel gabungan atau berisi blok kompleks belum didukung PDF backend.')
      return { header: cell.type === 'tableHeader', text: inlineHtml(cell.content[0].content) }
    })
  })
  const withHeadings = !!rows[0]?.length && rows[0].every((cell) => cell.header)
  if (rows.some((row, index) => row.some((cell) => cell.header !== (withHeadings && index === 0))))
    throw new Error('Hanya baris pertama yang dapat menjadi judul tabel.')
  return { withHeadings, ...(node.attrs?.showBorders === false ? { showBorders: false } : {}), content: rows.map((row) => row.map((cell) => cell.text)) }
}

export function tiptapToEditorData(doc: TiptapNode): EditorData {
  if (doc.type !== 'doc') throw new Error('Isi dokumen Tiptap tidak valid.')
  const nodes = doc.content ?? []
  if (nodes.length === 1 && nodes[0]?.type === 'paragraph' && !nodes[0].content?.length)
    return { blocks: [] }
  return { blocks: nodes.map((node) => {
    switch (node.type) {
      case 'paragraph': return { type: 'paragraph', data: { text: inlineHtml(node.content) } }
      case 'heading': return { type: 'header', data: { text: inlineHtml(node.content), level: Number(node.attrs?.level) || 2 } }
      case 'bulletList':
      case 'orderedList': return { type: 'list', data: { style: node.type === 'orderedList' ? 'ordered' : 'unordered', items: listItems(node) } }
      case 'table': return { type: 'table', data: tableData(node) }
      case 'image': {
        const src = node.attrs?.src
        if (typeof src !== 'string') throw new Error('Gambar dokumen tidak valid.')
        return { type: 'image', data: { file: { url: src }, caption: String(node.attrs?.caption ?? '') } }
      }
      default: throw new Error('Blok Tiptap ini belum dapat disimpan ke dokumen.')
    }
  }) }
}

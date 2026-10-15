import { describe, expect, it } from 'vitest'
import { editorDataToHtml, tiptapToEditorData } from '../src/utils/tiptap'

describe('konversi editor Tiptap dan blok backend', () => {
  it('membuka blok hasil impor sebagai konten Tiptap, termasuk tabel, daftar, dan gambar', () => {
    expect(editorDataToHtml({ blocks: [
      { type: 'header', data: { text: 'Judul', level: 2 } },
      { type: 'paragraph', data: { text: 'Teks <b>tebal</b>' } },
      { type: 'list', data: { style: 'ordered', items: [{ content: 'Utama', items: ['Anak'] }] } },
      { type: 'table', data: { withHeadings: true, content: [['Nama'], ['Sari']] } },
      { type: 'image', data: { file: { url: 'data:image/png;base64,YQ==' }, caption: 'Foto' } },
    ] })).toBe('<h2>Judul</h2><p>Teks <b>tebal</b></p><ol><li><p>Utama</p><ol><li><p>Anak</p></li></ol></li></ol><table><tbody><tr><th><p>Nama</p></th></tr><tr><td><p>Sari</p></td></tr></tbody></table><img src="data:image/png;base64,YQ==" data-caption="Foto">')
  })

  it('menyimpan JSON Tiptap dengan struktur blok yang diterima backend', () => {
    expect(tiptapToEditorData({ type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Judul' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Tebal', marks: [{ type: 'bold' }] }] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Utama' }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Anak' }] }] }] },
      ] }] },
      { type: 'table', content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nama' }] }] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sari' }] }] }] },
      ] },
      { type: 'image', attrs: { src: 'data:image/png;base64,YQ==', caption: 'Foto' } },
    ] })).toEqual({ blocks: [
      { type: 'header', data: { text: 'Judul', level: 2 } },
      { type: 'paragraph', data: { text: '<b>Tebal</b>' } },
      { type: 'list', data: { style: 'ordered', items: [{ content: 'Utama', items: ['Anak'] }] } },
      { type: 'table', data: { withHeadings: true, content: [['Nama'], ['Sari']] } },
      { type: 'image', data: { file: { url: 'data:image/png;base64,YQ==' }, caption: 'Foto' } },
    ] })
  })

  it('menolak konten yang akan hilang atau berubah saat disimpan', () => {
    expect(() => tiptapToEditorData({ type: 'doc', content: [{ type: 'blockquote' }] })).toThrow()
    expect(() => tiptapToEditorData({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'X', marks: [{ type: 'strike' }] }] }] })).toThrow()
    expect(() => tiptapToEditorData({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [{ type: 'paragraph' }] }] }] }] })).toThrow()
  })

  it('menyimpan editor kosong sebagai daftar blok kosong', () => {
    expect(tiptapToEditorData({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual({ blocks: [] })
  })

})

import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { EditorState } from '@tiptap/pm/state'
import { CellSelection, TableMap, addColumnAfter, addRowAfter, mergeCells, splitCell } from '@tiptap/pm/tables'
import { editorDataToHtml, tiptapToEditorData } from '../src/utils/tiptap'
import { splitTableRanges } from '../src/utils/table'

describe('konversi editor Tiptap dan blok backend', () => {
  it('mempertahankan paragraf kosong untuk ruang tanda tangan', () => {
    const data = tiptapToEditorData({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Hormat saya,' }] },
      { type: 'paragraph' }, { type: 'paragraph' }, { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'text', text: 'Nama penandatangan' }] },
    ] })
    expect(data.blocks.map((block) => block.data.text)).toEqual(['Hormat saya,', '', '', '', 'Nama penandatangan'])
    expect(editorDataToHtml(data)).toBe('<p>Hormat saya,</p><p></p><p></p><p></p><p>Nama penandatangan</p>')
  })
  it('menyimpan dan membuka ulang perataan paragraf serta judul', () => {
    for (const align of ['center', 'right', 'justify']) {
      const data = tiptapToEditorData({ type: 'doc', content: [
        { type: 'paragraph', attrs: { textAlign: align }, content: [{ type: 'text', text: 'Isi' }] },
        { type: 'heading', attrs: { level: 2, textAlign: align }, content: [{ type: 'text', text: 'Judul' }] },
      ] })
      expect(data.blocks.map((block) => block.data.align)).toEqual([align, align])
      expect(editorDataToHtml(data)).toBe(`<p style="text-align:${align}">Isi</p><h2 style="text-align:${align}">Judul</h2>`)
    }
    expect(() => editorDataToHtml({ blocks: [{ type: 'paragraph', data: { text: 'Isi', align: 'center;color:red' } }] })).toThrow('Perataan paragraf')
  })
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
      { type: 'paragraph', content: [{ type: 'text', text: 'Surat', marks: [{ type: 'fontFamily', attrs: { fontFamily: 'Times New Roman' } }] }] },
      { type: 'orderedList', content: [{ type: 'listItem', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Utama' }] },
        { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Anak' }] }] }] },
      ] }] },
      { type: 'table', content: [
        { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nama' }] }] }] },
        { type: 'tableRow', content: [{ type: 'tableCell', content: [
          { type: 'paragraph', content: [
            { type: 'text', text: 'Sari', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'tautan', marks: [{ type: 'link', attrs: { href: 'https://example.test' } }] },
          ] },
          { type: 'image', attrs: { src: 'data:image/png;base64,iVBORw0KGgo=', caption: 'Foto sel' } },
        ] }] },
      ] },
      { type: 'image', attrs: { src: 'data:image/png;base64,YQ==', caption: 'Foto' } },
    ] })).toEqual({ blocks: [
      { type: 'header', data: { text: 'Judul', level: 2 } },
      { type: 'paragraph', data: { text: '<b>Tebal</b>' } },
      { type: 'paragraph', data: { text: '<span data-font-family="Times New Roman">Surat</span>' } },
      { type: 'list', data: { style: 'ordered', items: [{ content: 'Utama', items: ['Anak'] }] } },
      { type: 'table', data: { withHeadings: true, content: [
        [[{ type: 'paragraph', content: [{ type: 'text', text: 'Nama' }] }]],
        [[
          { type: 'paragraph', content: [
            { type: 'text', text: 'Sari', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'tautan', marks: [{ type: 'link', attrs: { href: 'https://example.test' } }] },
          ] },
          { type: 'image', file: { url: 'data:image/png;base64,iVBORw0KGgo=' }, caption: 'Foto sel' },
        ]],
      ] } },
      { type: 'image', data: { file: { url: 'data:image/png;base64,YQ==' }, caption: 'Foto' } },
    ] })
  })

  it('menolak konten yang akan hilang atau berubah saat disimpan', () => {
    expect(() => tiptapToEditorData({ type: 'doc', content: [{ type: 'blockquote' }] })).toThrow()
    expect(() => tiptapToEditorData({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'X', marks: [{ type: 'strike' }] }] }] })).toThrow()
    expect(tiptapToEditorData({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [{ type: 'paragraph' }] }] }] }] }).blocks[0]?.data.content)
      .toEqual([[{ attrs: { colspan: 2 }, content: [{ type: 'paragraph', content: [] }] }]])
  })

  it('menyimpan editor kosong sebagai daftar blok kosong', () => {
    expect(tiptapToEditorData({ type: 'doc', content: [{ type: 'paragraph' }] })).toEqual({ blocks: [] })
  })

  it('menolak font di luar pilihan dokumen', () => {
    expect(() => tiptapToEditorData({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Teks', marks: [{ type: 'fontFamily', attrs: { fontFamily: 'Papyrus' } }] }] },
    ] })).toThrow('Jenis font belum dapat disimpan ke dokumen.')
  })

})

describe('kontrak tabel FE 05', () => {
  it('round-trips merge, width, row height, color, border and alignment attributes', () => {
    const block = { type: 'table', data: {
      withHeadings: true,
      rowMinHeights: [null, 44],
      content: [
        [
          { attrs: { colspan: 2, colwidth: [120, 90], align: 'center', verticalAlign: 'middle', backgroundColor: 'blue', border: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gabungan' }] }] },
          { attrs: { rowspan: 2, colwidth: [72] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Vertikal' }] }] },
          { attrs: { colwidth: [80] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kolom' }] }] },
        ],
        [
          { attrs: { colwidth: [120] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Baris kedua' }] }] },
          { attrs: { colwidth: [90] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Isi' }] }] },
          { attrs: { colwidth: [80] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ujung' }] }] },
        ],
      ],
    } }
    const html = editorDataToHtml({ blocks: [block] })
    expect(html).toContain('colspan="2" colwidth="120,90" align="center" data-vertical-align="middle" data-cell-color="blue" data-cell-border="false"')
    expect(html).toContain('rowspan="2" colwidth="72"')
    expect(html).toContain('data-row-min-height-px="44" style="height:44px"')
    expect(tiptapToEditorData({ type: 'doc', content: [{ type: 'table', attrs: { showBorders: true }, content: [
      { type: 'tableRow', content: [
        { type: 'tableHeader', attrs: { colspan: 2, rowspan: 1, colwidth: [120, 90], align: 'center', verticalAlign: 'middle', backgroundColor: 'blue', border: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gabungan' }] }] },
        { type: 'tableHeader', attrs: { colspan: 1, rowspan: 2, colwidth: [72], align: null, verticalAlign: 'top' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Vertikal' }] }] },
        { type: 'tableHeader', attrs: { colspan: 1, rowspan: 1, colwidth: [80] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kolom' }] }] },
      ] },
      { type: 'tableRow', attrs: { minHeightPx: 44 }, content: [
        { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Baris kedua' }] }] },
        { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [90] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Isi' }] }] },
        { type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [80] }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ujung' }] }] },
      ] },
    ] }] })).toEqual({ blocks: [block] })
  })

  it('membagi dimensi menjadi rentang sel yang utuh dan menolak input tak valid', () => {
    expect(splitTableRanges(5, 2)).toEqual([[0, 2], [2, 5]])
    expect(splitTableRanges(4, 4)).toEqual([[0, 1], [1, 2], [2, 3], [3, 4]])
    expect(() => splitTableRanges(2, 3)).toThrow('Pembagian tabel tidak valid.')
  })

  it('membagi sel biasa menjadi 2x2, menjaga isi asal di kiri atas, dan mengosongkan sel baru', () => {
    const schema = getSchema([StarterKit, TableKit])
    const doc = schema.nodeFromJSON({ type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [
      { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Isi asal' }] }] },
    ] }] }] })
    let tablePosition = 0
    doc.descendants((node, position) => { if (node.type.name === 'table') tablePosition = position })
    let state = EditorState.create({ doc })
    let table = state.doc.nodeAt(tablePosition)!
    let map = TableMap.get(table)
    state = state.apply(state.tr.setSelection(CellSelection.create(state.doc, tablePosition + 1 + map.map[0])))

    const run = (command: typeof addRowAfter) => {
      let transaction
      expect(command(state, (next) => { transaction = next })).toBe(true)
      if (transaction) state = state.apply(transaction)
    }
    run(addRowAfter)
    run(addColumnAfter)
    table = state.doc.nodeAt(tablePosition)!
    map = TableMap.get(table)
    state = state.apply(state.tr.setSelection(CellSelection.create(
      state.doc,
      tablePosition + 1 + map.map[0],
      tablePosition + 1 + map.map[map.map.length - 1],
    )))
    run(mergeCells)
    run(splitCell)

    table = state.doc.nodeAt(tablePosition)!
    map = TableMap.get(table)
    expect(map.problems).toBeNull()
    expect([map.width, map.height]).toEqual([2, 2])
    expect(table.content.content.map((row) => row.childCount)).toEqual([2, 2])
    expect(table.child(0).child(0).textContent).toBe('Isi asal')
    expect(table.content.content.slice(0).flatMap((row) => row.content.content).slice(1).every((cell) => cell.textContent === '')).toBe(true)
  })
})

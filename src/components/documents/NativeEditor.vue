<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { Editor, EditorContent, Extension, Mark, mergeAttributes } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { CellSelection, TableMap } from '@tiptap/pm/tables'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorData } from '../../types/documents'
import { editorPayload } from '../../utils/editor'
import { splitTableRanges } from '../../utils/table'
import { documentFontFamilies, editorDataToHtml, isDocumentFontFamily, tiptapToEditorData, type TiptapNode } from '../../utils/tiptap'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import { t } from '../../services/workspace-language'
import { confirmAction } from '../../services/feedback'

const props = defineProps<{ data: EditorData; readonly?: boolean; hasDecorations?: boolean }>()
const emit = defineEmits<{ change: [data: EditorData]; pending: []; invalid: [message: string] }>()
const editor = shallowRef<Editor>()
const fileInput = ref<HTMLInputElement>()
const error = ref('')
const toolbarVersion = ref(0)
const formatMenu = ref<HTMLDetailsElement | null>(null)
const splitDialog = ref<HTMLDialogElement | null>(null)
const splitRows = ref('2')
const splitColumns = ref('2')
const splitError = ref('')
const rowMinimumHeight = ref('')
let disposed = false
let locked = false

function active(format: string) {
  void toolbarVersion.value
  return editor.value?.isActive(format) ?? false
}
function aligned(value: string) {
  void toolbarVersion.value
  return editor.value?.isActive({ textAlign: value }) ?? false
}
function selectedFontFamily() {
  void toolbarVersion.value
  const value = editor.value?.getAttributes('fontFamily').fontFamily
  return isDocumentFontFamily(value) ? value : ''
}
function selectedBlock(level: number) {
  void toolbarVersion.value
  return level
    ? editor.value?.isActive('heading', { level }) ?? false
    : editor.value?.isActive('paragraph') ?? false
}
function closeFormatMenu() {
  if (formatMenu.value) formatMenu.value.open = false
}
function closeFormatMenuOnFocusout(event: FocusEvent) {
  const next = event.relatedTarget
  if (!(next instanceof Node) || !formatMenu.value?.contains(next)) closeFormatMenu()
}
function formatFont(fontFamily: string) {
  if (!editor.value || locked) return
  if (isDocumentFontFamily(fontFamily)) editor.value.chain().focus().setMark('fontFamily', { fontFamily }).run()
  else editor.value.chain().focus().unsetMark('fontFamily').run()
  closeFormatMenu()
}
function listDepth() {
  const selection = editor.value?.state.selection.$from
  if (!selection) return 0
  let depth = 0
  for (let index = 0; index <= selection.depth; index++) {
    if (selection.node(index).type.name === 'listItem') depth++
  }
  return depth
}
function indentList() {
  if (listDepth() >= 3) {
    error.value = 'Daftar maksimal tiga tingkat.'
    return
  }
  editor.value?.chain().focus().sinkListItem('listItem').run()
}
function selectedTable() {
  const selection = editor.value?.state.selection
  if (!selection) return
  if (selection instanceof NodeSelection && selection.node.type.name === 'table')
    return { position: selection.from, node: selection.node }
  for (let depth = selection.$from.depth; depth > 0; depth--) {
    if (selection.$from.node(depth).type.name === 'table')
      return { position: selection.$from.before(depth), node: selection.$from.node(depth) }
  }
}
function tableLinesHidden() {
  void toolbarVersion.value
  return selectedTable()?.node.attrs.showBorders === false
}
function toggleTableLines() {
  const table = selectedTable()
  if (table) editor.value?.chain().focus().updateAttributes('table', { showBorders: table.node.attrs.showBorders === false }).run()
}
const tableColors = ['gray', 'blue', 'green', 'yellow', 'orange', 'red', 'purple'] as const
function cellAttribute(name: string) {
  void toolbarVersion.value
  return editor.value?.getAttributes('tableCell')[name]
    ?? editor.value?.getAttributes('tableHeader')[name]
    ?? ''
}
function setCellAttribute(name: string, value: unknown) {
  if (!editor.value || locked) return
  editor.value.chain().focus().setCellAttribute(name, value).run()
}
function setCellAttributeFromEvent(name: string, event: Event) {
  setCellAttribute(name, (event.target as HTMLSelectElement).value || null)
}
function cellBorderHidden() {
  const value = cellAttribute('border')
  return typeof value === 'boolean' ? !value : selectedTable()?.node.attrs.showBorders === false
}
function setCellBorder() {
  const current = editor.value?.getAttributes('tableCell').border
    ?? editor.value?.getAttributes('tableHeader').border
  const visible = current ?? selectedTable()?.node.attrs.showBorders !== false
  setCellAttribute('border', !visible)
}
function cellContext(allowRange = false) {
  const current = editor.value
  const selection = current?.state.selection
  const table = selectedTable()
  if (!current || !selection || !table) return
  if (selection instanceof CellSelection && selection.$anchorCell.pos !== selection.$headCell.pos && !allowRange) return
  let cellPosition: number | undefined
  if (selection instanceof CellSelection) cellPosition = selection.$anchorCell.pos
  else {
    for (let depth = selection.$from.depth; depth > 0; depth--) {
      if (['tableCell', 'tableHeader'].includes(selection.$from.node(depth).type.name)) {
        cellPosition = selection.$from.before(depth)
        break
      }
    }
  }
  if (cellPosition === undefined) return
  const map = TableMap.get(table.node)
  try {
    const rect = selection instanceof CellSelection && selection.$anchorCell.pos !== selection.$headCell.pos
      ? map.rectBetween(selection.$anchorCell.pos - table.position - 1, selection.$headCell.pos - table.position - 1)
      : map.findCell(cellPosition - table.position - 1)
    return { table, cellPosition, map, rect }
  } catch { return }
}
function canSplitCell() {
  const context = cellContext()
  return !!context && (context.rect.right - context.rect.left > 1 || context.rect.bottom - context.rect.top > 1
    || context.map.width < 20 || context.map.height < 50)
}
function openSplitDialog() {
  const context = cellContext()
  if (!context) return
  const availableRows = Math.max(1, Math.min(50 - context.map.height + context.rect.bottom - context.rect.top, 50))
  const availableColumns = Math.max(1, Math.min(20 - context.map.width + context.rect.right - context.rect.left, 20))
  splitRows.value = String(Math.max(context.rect.bottom - context.rect.top, Math.min(2, availableRows)))
  splitColumns.value = String(Math.max(context.rect.right - context.rect.left, Math.min(2, availableColumns)))
  splitError.value = ''
  splitDialog.value?.showModal()
}
function splitTableRect(tr: Editor['state']['tr'], tablePosition: number, top: number, left: number, rows: number, columns: number) {
  const table = tr.doc.nodeAt(tablePosition)
  if (!table) return false
  const map = TableMap.get(table)
  if (top < 0 || left < 0 || top + rows > map.height || left + columns > map.width) return false
  const anchor = tablePosition + 1 + map.map[top * map.width + left]!
  const head = tablePosition + 1 + map.map[(top + rows - 1) * map.width + left + columns - 1]!
  tr.setSelection(CellSelection.create(tr.doc, anchor, head))
  return true
}
function splitCell() {
  const current = editor.value
  const context = cellContext()
  if (!current || !context) return
  const rows = Number(splitRows.value), columns = Number(splitColumns.value)
  const sourceRows = context.rect.bottom - context.rect.top
  const sourceColumns = context.rect.right - context.rect.left
  const regionRows = Math.max(rows, sourceRows)
  const regionColumns = Math.max(columns, sourceColumns)
  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(columns) || columns < 1
    || context.map.height + regionRows - (context.rect.bottom - context.rect.top) > 50
    || context.map.width + regionColumns - (context.rect.right - context.rect.left) > 20
    || (rows === 1 && columns === 1)) {
    splitError.value = 'Jumlah baris dan kolom tabel tidak valid atau melewati batas.'
    return
  }

  const chain = current.chain().focus()
  for (let index = context.rect.bottom - context.rect.top; index < regionRows; index++) chain.addRowAfter()
  for (let index = context.rect.right - context.rect.left; index < regionColumns; index++) chain.addColumnAfter()
  const tablePosition = context.table.position
  const cellPosition = context.cellPosition
  chain.command(({ tr }) => {
    const mappedTable = tr.mapping.map(tablePosition)
    const mappedCell = tr.mapping.map(cellPosition)
    const table = tr.doc.nodeAt(mappedTable)
    if (!table) return false
    const rect = TableMap.get(table).findCell(mappedCell - mappedTable - 1)
    return splitTableRect(tr, mappedTable, rect.top, rect.left, regionRows, regionColumns)
  })
  if (regionRows > sourceRows || regionColumns > sourceColumns) chain.mergeCells()
  chain.splitCell()
  const rowRanges = splitTableRanges(regionRows, rows)
  const columnRanges = splitTableRanges(regionColumns, columns)
  for (const [top, bottom] of rowRanges) {
    for (const [left, right] of columnRanges) {
      if ((bottom - top) * (right - left) < 2) continue
      chain.command(({ tr }) => splitTableRect(tr, tr.mapping.map(tablePosition), top, left, bottom - top, right - left))
      chain.mergeCells()
    }
  }
  if (!chain.run()) {
    splitError.value = 'Sel tabel belum dapat dibagi dengan ukuran tersebut.'
    return
  }
  splitDialog.value?.close()
}
function setRowHeight(clear = false) {
  const current = editor.value
  const context = cellContext(true)
  if (!current || !context) return
  const height = clear ? null : Number(rowMinimumHeight.value)
  if (height !== null && (!Number.isInteger(height) || height < 1 || height > 1200)) {
    error.value = t('Tinggi minimum baris harus antara 1 dan 1200 px.')
    return
  }
  const transaction = current.state.tr
  const start = context.table.position + 1
  for (let row = context.rect.top; row < context.rect.bottom; row++) {
    let position = start
    for (let index = 0; index < row; index++) position += context.table.node.child(index).nodeSize
    transaction.setNodeMarkup(position, undefined, { ...context.table.node.child(row).attrs, minHeightPx: height })
  }
  current.view.dispatch(transaction)
  current.commands.focus()
}
function syncRowHeight() {
  const context = cellContext(true)
  const heights = context
    ? Array.from({ length: context.rect.bottom - context.rect.top }, (_, index) => context.table.node.child(context.rect.top + index).attrs.minHeightPx ?? null)
    : []
  rowMinimumHeight.value = heights.length && heights.every((height) => height === heights[0]) && heights[0] !== null
    ? String(heights[0])
    : ''
}
async function removeTablePart(part: 'column' | 'row' | 'table') {
  const label = { column: 'kolom', row: 'baris', table: 'tabel' }[part]
  if (!(await confirmAction(`Hapus ${label} ini dari dokumen?`, {
    title: `Hapus ${label}`, action: 'Hapus', danger: true,
  }))) return
  if (part === 'column') editor.value?.chain().focus().deleteColumn().run()
  else if (part === 'row') editor.value?.chain().focus().deleteRow().run()
  else editor.value?.chain().focus().deleteTable().run()
}
function canMoveTable(direction: 'up' | 'down') {
  void toolbarVersion.value
  const table = selectedTable()
  const doc = editor.value?.state.doc
  if (!table || !doc) return false
  return direction === 'up'
    ? !!doc.resolve(table.position).nodeBefore
    : !!doc.nodeAt(table.position + table.node.nodeSize)
}
function moveTable(direction: 'up' | 'down') {
  const current = editor.value
  const table = selectedTable()
  if (!current || !table) return
  const sibling = direction === 'up'
    ? current.state.doc.resolve(table.position).nodeBefore
    : current.state.doc.nodeAt(table.position + table.node.nodeSize)
  if (!sibling) return
  const nextPosition = direction === 'up'
    ? table.position - sibling.nodeSize
    : table.position + sibling.nodeSize
  const transaction = current.state.tr.delete(table.position, table.position + table.node.nodeSize)
    .insert(nextPosition, table.node)
  transaction.setSelection(NodeSelection.create(transaction.doc, nextPosition))
  current.view.dispatch(transaction)
  current.commands.focus()
}

const DocumentImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      caption: {
        default: '',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-caption') ?? '',
        renderHTML: (attributes: { caption?: string }) => ({ 'data-caption': attributes.caption ?? '' }),
      },
    }
  },
  addNodeView() {
    return ({ node }) => {
      const figure = document.createElement('figure')
      const image = document.createElement('img')
      const caption = document.createElement('figcaption')
      figure.append(image, caption)
      const render = (current: typeof node) => {
        image.src = String(current.attrs.src ?? '')
        image.alt = String(current.attrs.alt ?? '')
        caption.textContent = String(current.attrs.caption ?? '')
        caption.hidden = !caption.textContent
      }
      render(node)
      return {
        dom: figure,
        update(current) {
          if (current.type !== node.type) return false
          render(current)
          return true
        },
      }
    }
  },
}).configure({ allowBase64: true })

const TableBorders = Extension.create({
  name: 'tableBorders',
  addGlobalAttributes() {
    return [{
      types: ['table'],
      attributes: {
        showBorders: {
          default: true,
          parseHTML: (element: HTMLElement) => element.getAttribute('data-show-borders') !== 'false',
          renderHTML: (attributes: { showBorders?: boolean }) => attributes.showBorders === false ? { 'data-show-borders': 'false' } : {},
        },
      },
    }]
  },
})

const TableCellStyles = Extension.create({
  name: 'tableCellStyles',
  addGlobalAttributes() {
    return [{
      types: ['tableCell', 'tableHeader'],
      attributes: {
        verticalAlign: {
          default: 'top',
          parseHTML: (element: HTMLElement) => ['top', 'middle', 'bottom'].includes(element.dataset.verticalAlign ?? '') ? element.dataset.verticalAlign : 'top',
          renderHTML: (attributes: { verticalAlign?: string }) => attributes.verticalAlign && attributes.verticalAlign !== 'top' ? { 'data-vertical-align': attributes.verticalAlign } : {},
        },
        backgroundColor: {
          default: null,
          parseHTML: (element: HTMLElement) => tableColors.includes(element.dataset.cellColor as typeof tableColors[number]) ? element.dataset.cellColor : null,
          renderHTML: (attributes: { backgroundColor?: string | null }) => attributes.backgroundColor && tableColors.includes(attributes.backgroundColor as typeof tableColors[number]) ? { 'data-cell-color': attributes.backgroundColor } : {},
        },
        border: {
          default: null,
          parseHTML: (element: HTMLElement) => element.dataset.cellBorder === 'true' ? true : element.dataset.cellBorder === 'false' ? false : null,
          renderHTML: (attributes: { border?: boolean | null }) => typeof attributes.border === 'boolean' ? { 'data-cell-border': String(attributes.border) } : {},
        },
      },
    }]
  },
})

const TableRowHeight = Extension.create({
  name: 'tableRowHeight',
  addGlobalAttributes() {
    return [{
      types: ['tableRow'],
      attributes: {
        minHeightPx: {
          default: null,
          parseHTML: (element: HTMLElement) => {
            const value = Number(element.dataset.rowMinHeightPx)
            return Number.isInteger(value) && value >= 1 && value <= 1200 ? value : null
          },
          renderHTML: (attributes: { minHeightPx?: number | null }) => {
            const value = attributes.minHeightPx
            return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 1200
              ? { 'data-row-min-height-px': String(value), style: `height:${value}px` }
              : {}
          },
        },
      },
    }]
  },
})

const DocumentFontFamily = Mark.create({
  name: 'fontFamily',
  addAttributes() {
    return { fontFamily: { default: null, rendered: false } }
  },
  parseHTML() {
    return [{
      tag: 'span[data-font-family]',
      getAttrs: (element) => {
        const fontFamily = (element as HTMLElement).getAttribute('data-font-family')
        return isDocumentFontFamily(fontFamily) ? { fontFamily } : false
      },
    }]
  },
  renderHTML({ mark, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-font-family': mark.attrs.fontFamily }), 0]
  },
})

const paperWidth = 794
const paperHeight = 1123
const paperGap = 24
const paperPaddingX = 68
const paperPaddingY = 76
const decoratedPaperPaddingY = 170
const paperStride = paperHeight + paperGap
const paperStyle = computed(() => ({
  '--paper-width': `${paperWidth}px`,
  '--paper-height': `${paperHeight}px`,
  '--paper-gap': `${paperGap}px`,
  '--paper-padding-x': `${paperPaddingX}px`,
  '--paper-padding-y': `${props.hasDecorations ? decoratedPaperPaddingY : paperPaddingY}px`,
}))
const paperPagesKey = new PluginKey<DecorationSet>('paperPages')
const PaperPages = Extension.create({
  name: 'paperPages',
  addProseMirrorPlugins() {
    return [new Plugin<DecorationSet>({
      key: paperPagesKey,
      state: {
        init: () => DecorationSet.empty,
        apply(transaction, decorations) {
          return transaction.getMeta(paperPagesKey) ?? decorations.map(transaction.mapping, transaction.doc)
        },
      },
      props: {
        decorations(state) { return paperPagesKey.getState(state) },
      },
      view(view) {
        let frame = 0
        let previous = ''
        const measure = () => {
          if (!view.dom.isConnected) return
          const pageStyle = getComputedStyle(view.dom)
          const paddingTop = parseFloat(pageStyle.paddingTop) || paperPaddingY
          const paddingBottom = parseFloat(pageStyle.paddingBottom) || paperPaddingY
          let y = paddingTop
          const gaps: { position: number; height: number }[] = []
          view.state.doc.forEach((_node, position) => {
            const element = view.nodeDOM(position)
            if (!(element instanceof HTMLElement)) return
            const style = getComputedStyle(element)
            const height = element.getBoundingClientRect().height + (parseFloat(style.marginBottom) || 0)
            const page = Math.floor(y / paperStride)
            const pageEnd = page * paperStride + paperHeight - paddingBottom
            if (height <= paperHeight - paddingTop - paddingBottom && y + height > pageEnd) {
              const gap = (page + 1) * paperStride + paddingTop - y
              gaps.push({ position, height: gap })
              y += gap
            }
            y += height
          })
          const signature = JSON.stringify(gaps)
          if (signature === previous) return
          previous = signature
          const decorations = DecorationSet.create(view.state.doc, gaps.map(({ position, height }) =>
            Decoration.widget(position, () => {
              const gap = document.createElement('div')
              gap.className = 'editor-page-gap'
              gap.style.height = `${height}px`
              return gap
            }, { side: -1 }),
          ))
          view.dispatch(view.state.tr.setMeta(paperPagesKey, decorations).setMeta('addToHistory', false))
        }
        const schedule = () => {
          cancelAnimationFrame(frame)
          frame = requestAnimationFrame(measure)
        }
        const observer = new ResizeObserver(schedule)
        observer.observe(view.dom)
        void document.fonts?.ready.then(schedule)
        schedule()
        return {
          update: schedule,
          destroy() { cancelAnimationFrame(frame); observer.disconnect() },
        }
      },
    })]
  },
})

async function capture() {
  if (!editor.value || disposed) return
  try {
    const payload = editorPayload(tiptapToEditorData(editor.value.getJSON() as TiptapNode))
    error.value = ''
    emit('change', payload)
    return payload
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Isi editor belum dapat disimpan.'
    emit('invalid', error.value)
  }
}
async function render(data: EditorData) {
  if (!editor.value || disposed) return
  try {
    editor.value.commands.setContent(editorDataToHtml(editorPayload(data)), {
      emitUpdate: false,
      // shortcut: Tiptap's HTML check rejects table tbody; remove this exception when its parser accepts it.
      errorOnInvalidContent: !data.blocks.some((block) => block.type === 'table'),
    })
    error.value = ''
  } catch {
    error.value = 'Isi dokumen belum dapat dimuat di editor. Jangan simpan sebelum memeriksanya.'
    emit('invalid', error.value)
  }
}
function showCellError(fields: Record<string, string>) {
  const surface = editor.value?.view.dom
  if (!surface) return
  surface.querySelectorAll('.validation-cell').forEach((cell) => {
    cell.classList.remove('validation-cell')
    cell.removeAttribute('aria-invalid')
    cell.removeAttribute('title')
  })
  for (const [path, message] of Object.entries(fields)) {
    const match = /^editor_data\.blocks\.(\d+)\.data\.content\.(\d+)\.(\d+)(?:\.|$)/.exec(path)
    if (!match) continue
    const block = Number(match[1]), row = Number(match[2]), column = Number(match[3])
    const tableIndex = props.data.blocks.slice(0, block).filter((item) => item.type === 'table').length
    const cell = surface.querySelectorAll('table')[tableIndex]?.querySelectorAll('tr')[row]?.children[column]
    if (!(cell instanceof HTMLElement)) continue
    cell.classList.add('validation-cell')
    cell.setAttribute('aria-invalid', 'true')
    cell.setAttribute('title', message)
    cell.scrollIntoView({ block: 'nearest' })
  }
}
async function lock() {
  locked = true
  editor.value?.setEditable(false)
}
defineExpose({ capture, render, lock, showCellError })

function formatBlock(level: number) {
  if (!editor.value || locked) return
  if (level) editor.value.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run()
  else editor.value.chain().focus().setParagraph().run()
  closeFormatMenu()
}
function link() {
  if (!editor.value || locked) return
  const href = window.prompt(t('Alamat tautan HTTPS, HTTP, atau mailto:'), editor.value.getAttributes('link').href ?? 'https://')
  if (href === null) return
  if (!href.trim()) { editor.value.chain().focus().unsetLink().run(); return }
  if (!/^(https?:\/\/|mailto:)/i.test(href.trim())) {
    error.value = 'Tautan harus memakai alamat HTTP, HTTPS, atau email.'
    return
  }
  editor.value.chain().focus().setLink({ href: href.trim() }).run()
}
function caption() {
  if (!editor.value?.isActive('image') || locked) return
  const text = window.prompt(t('Keterangan gambar:'), String(editor.value.getAttributes('image').caption ?? ''))
  if (text !== null) editor.value.chain().focus().updateAttributes('image', { caption: text }).run()
}
async function addImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !editor.value || locked) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 500000) {
    error.value = 'Gunakan PNG/JPEG/WebP maksimal 500 KB.'
    return
  }
  try {
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = reject
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(file)
    })
    if (!disposed && !locked) editor.value?.chain().focus().insertContent({ type: 'image', attrs: { src, caption: '' } }).run()
  } catch { error.value = 'Gambar belum dapat dibaca. Pilih ulang berkasnya.' }
}

watch(() => props.readonly, (value) => {
  if (!locked) editor.value?.setEditable(!value)
})
watch(() => props.hasDecorations, () => {
  const current = editor.value
  if (current) current.view.dispatch(current.state.tr)
}, { flush: 'post' })
onMounted(() => {
  try {
    editor.value = new Editor({
      content: editorDataToHtml(editorPayload(props.data)),
      editable: !props.readonly,
      extensions: [
        StarterKit.configure({ blockquote: false, codeBlock: false, horizontalRule: false, strike: false }),
        TableKit.configure({ table: { allowTableNodeSelection: true, resizable: true, cellMinWidth: 64 } }),
        TableBorders,
        TableCellStyles,
        TableRowHeight,
        DocumentFontFamily,
        PaperPages,
        DocumentImage,
        Highlight,
        TextAlign.configure({ types: ['paragraph', 'heading'], defaultAlignment: 'left' }),
      ],
      onUpdate() {
        toolbarVersion.value++
        syncRowHeight()
        emit('pending')
        void capture()
      },
      onSelectionUpdate() { toolbarVersion.value++; syncRowHeight() },
      editorProps: {
        handleKeyDown(_view, event) {
          if (event.key === 'Tab' && !event.shiftKey && listDepth() >= 3) {
            event.preventDefault()
            error.value = 'Daftar maksimal tiga tingkat.'
            return true
          }
          return false
        },
      },
    })
  } catch {
    error.value = 'Editor belum dapat dimuat. Muat ulang halaman.'
    emit('invalid', error.value)
  }
})
onUnmounted(() => {
  disposed = true
  editor.value?.destroy()
  editor.value = undefined
})
</script>
<template>
  <div>
    <FeedbackMessage :message="t(error)" error />
    <div v-if="editor && !readonly" role="toolbar" :aria-label="t('Format dokumen')" class="mb-2 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-white p-2 text-ink">
      <details
        ref="formatMenu"
        class="editor-format-menu relative"
        @keydown.esc.prevent="closeFormatMenu"
        @focusout="closeFormatMenuOnFocusout"
      >
        <summary class="editor-format-summary inline-flex h-10 cursor-pointer items-center gap-2 rounded border border-line bg-white px-3 text-sm text-ink hover:bg-soft">
          <span class="material-symbols-outlined" aria-hidden="true">format_size</span>
          <span>{{ t('Format dokumen') }}</span>
          <span class="editor-format-chevron material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </summary>
        <div class="absolute left-0 top-full z-30 mt-2 max-h-80 w-64 overflow-y-auto rounded-xl border border-line bg-white p-1.5 shadow-lg">
          <div class="px-2 pb-1 pt-2 text-xs font-semibold text-muted">{{ t('Jenis paragraf') }}</div>
          <button type="button" class="editor-format-item" :aria-pressed="selectedBlock(0)" @click="formatBlock(0)">
            <span class="material-symbols-outlined" aria-hidden="true">subject</span>
            <span>{{ t('Normal') }}</span>
          </button>
          <button v-for="level in 6" :key="level" type="button" class="editor-format-item" :aria-pressed="selectedBlock(level)" @click="formatBlock(level)">
            <span class="material-symbols-outlined" aria-hidden="true">{{ `format_h${level}` }}</span>
            <span>{{ t('Judul :number', { number: level }) }}</span>
          </button>
          <div class="px-2 pb-1 pt-3 text-xs font-semibold text-muted">{{ t('Jenis font') }}</div>
          <button type="button" class="editor-format-item" :aria-pressed="selectedFontFamily() === ''" @click="formatFont('')">
            <span class="material-symbols-outlined" aria-hidden="true">text_fields</span>
            <span>{{ t('Default (DejaVu Sans)') }}</span>
          </button>
          <button v-for="fontFamily in documentFontFamilies" :key="fontFamily" type="button" class="editor-format-item" :aria-pressed="selectedFontFamily() === fontFamily" @click="formatFont(fontFamily)">
            <span class="material-symbols-outlined" aria-hidden="true">font_download</span>
            <span>{{ fontFamily }}</span>
          </button>
        </div>
      </details>
      <div class="flex rounded border border-line" role="group" :aria-label="t('Gaya teks')">
        <button type="button" class="editor-tool" :aria-label="t('Tebal')" :title="t('Tebal')" :aria-pressed="active('bold')" @click="editor.chain().focus().toggleBold().run()"><span class="material-symbols-outlined" aria-hidden="true">format_bold</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Miring')" :title="t('Miring')" :aria-pressed="active('italic')" @click="editor.chain().focus().toggleItalic().run()"><span class="material-symbols-outlined" aria-hidden="true">format_italic</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Garis bawah')" :title="t('Garis bawah')" :aria-pressed="active('underline')" @click="editor.chain().focus().toggleUnderline().run()"><span class="material-symbols-outlined" aria-hidden="true">format_underlined</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Sorot')" :title="t('Sorot')" :aria-pressed="active('highlight')" @click="editor.chain().focus().toggleHighlight().run()"><span class="material-symbols-outlined" aria-hidden="true">ink_highlighter</span></button>
      </div>
      <div class="flex rounded border border-line" role="group" :aria-label="t('Perataan paragraf')">
        <button type="button" class="editor-tool" :aria-label="t('Rata kiri')" :title="t('Rata kiri')" :aria-pressed="aligned('left')" @click="editor.chain().focus().setTextAlign('left').run()"><span class="material-symbols-outlined" aria-hidden="true">format_align_left</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Rata tengah')" :title="t('Rata tengah')" :aria-pressed="aligned('center')" @click="editor.chain().focus().setTextAlign('center').run()"><span class="material-symbols-outlined" aria-hidden="true">format_align_center</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Rata kanan')" :title="t('Rata kanan')" :aria-pressed="aligned('right')" @click="editor.chain().focus().setTextAlign('right').run()"><span class="material-symbols-outlined" aria-hidden="true">format_align_right</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Rata kiri-kanan')" :title="t('Rata kiri-kanan')" :aria-pressed="aligned('justify')" @click="editor.chain().focus().setTextAlign('justify').run()"><span class="material-symbols-outlined" aria-hidden="true">format_align_justify</span></button>
      </div>
      <div class="flex rounded border border-line" role="group" :aria-label="t('Daftar dan tautan')">
        <button type="button" class="editor-tool" :aria-label="t('Daftar poin')" :title="t('Daftar poin')" :aria-pressed="active('bulletList')" @click="editor.chain().focus().toggleBulletList().run()"><span class="material-symbols-outlined" aria-hidden="true">format_list_bulleted</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Daftar nomor')" :title="t('Daftar nomor')" :aria-pressed="active('orderedList')" @click="editor.chain().focus().toggleOrderedList().run()"><span class="material-symbols-outlined" aria-hidden="true">format_list_numbered</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Kurangi tingkat daftar')" :title="t('Kurangi tingkat daftar (Shift+Tab)')" :disabled="!editor.can().liftListItem('listItem')" @click="editor.chain().focus().liftListItem('listItem').run()"><span class="material-symbols-outlined" aria-hidden="true">format_indent_decrease</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Tambah tingkat daftar')" :title="t('Tambah tingkat daftar (Tab)')" :disabled="listDepth() >= 3 || !editor.can().sinkListItem('listItem')" @click="indentList"><span class="material-symbols-outlined" aria-hidden="true">format_indent_increase</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Tautan')" :title="t('Tautan')" @click="link"><span class="material-symbols-outlined" aria-hidden="true">link</span></button>
      </div>
      <div class="flex rounded border border-line" role="group" :aria-label="t('Tabel')">
        <button type="button" class="editor-tool" :aria-label="t('Buat tabel')" :title="t('Buat tabel')" @click="editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()"><span class="material-symbols-outlined" aria-hidden="true">table_chart</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Tambah kolom sebelum')" :title="t('Tambah kolom sebelum')" :disabled="!editor.can().addColumnBefore()" @click="editor.chain().focus().addColumnBefore().run()"><span class="material-symbols-outlined" aria-hidden="true">add_column_left</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Tambah kolom sesudah')" :title="t('Tambah kolom sesudah')" :disabled="!editor.can().addColumnAfter()" @click="editor.chain().focus().addColumnAfter().run()"><span class="material-symbols-outlined" aria-hidden="true">add_column_right</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Hapus kolom')" :title="t('Hapus kolom')" :disabled="!editor.can().deleteColumn()" @click="removeTablePart('column')"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Tambah baris sebelum')" :title="t('Tambah baris sebelum')" :disabled="!editor.can().addRowBefore()" @click="editor.chain().focus().addRowBefore().run()"><span class="material-symbols-outlined" aria-hidden="true">add_row_above</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Tambah baris sesudah')" :title="t('Tambah baris sesudah')" :disabled="!editor.can().addRowAfter()" @click="editor.chain().focus().addRowAfter().run()"><span class="material-symbols-outlined" aria-hidden="true">add_row_below</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Hapus baris')" :title="t('Hapus baris')" :disabled="!editor.can().deleteRow()" @click="removeTablePart('row')"><span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Hapus tabel')" :title="t('Hapus tabel')" :disabled="!editor.can().deleteTable()" @click="removeTablePart('table')"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Pindahkan tabel ke atas')" :title="t('Pindahkan tabel ke atas')" :disabled="!canMoveTable('up')" @click="moveTable('up')"><span class="material-symbols-outlined" aria-hidden="true">arrow_upward</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Pindahkan tabel ke bawah')" :title="t('Pindahkan tabel ke bawah')" :disabled="!canMoveTable('down')" @click="moveTable('down')"><span class="material-symbols-outlined" aria-hidden="true">arrow_downward</span></button>
        <button type="button" class="editor-tool" :aria-label="t(tableLinesHidden() ? 'Tampilkan garis tabel' : 'Sembunyikan garis tabel')" :title="t(tableLinesHidden() ? 'Tampilkan garis tabel' : 'Sembunyikan garis tabel')" :disabled="!selectedTable()" @click="toggleTableLines"><span class="material-symbols-outlined" aria-hidden="true">{{ tableLinesHidden() ? 'visibility' : 'visibility_off' }}</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Gabungkan sel')" :title="t('Gabungkan sel')" :disabled="!editor.can().mergeCells()" @click="editor.chain().focus().mergeCells().run()"><span class="material-symbols-outlined" aria-hidden="true">merge</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Bagi sel')" :title="t('Bagi sel')" :disabled="!canSplitCell()" @click="openSplitDialog"><span class="material-symbols-outlined" aria-hidden="true">splitscreen</span></button>
        <label class="table-select"><span class="sr-only">{{ t('Warna sel') }}</span><select :aria-label="t('Warna sel')" :value="cellAttribute('backgroundColor') || ''" :disabled="!selectedTable()" @change="setCellAttributeFromEvent('backgroundColor', $event)"><option value="">{{ t('Tanpa warna') }}</option><option value="gray">{{ t('Abu-abu') }}</option><option value="blue">{{ t('Biru') }}</option><option value="green">{{ t('Hijau') }}</option><option value="yellow">{{ t('Kuning') }}</option><option value="orange">{{ t('Jingga') }}</option><option value="red">{{ t('Merah') }}</option><option value="purple">{{ t('Ungu') }}</option></select></label>
        <label class="table-select"><span class="sr-only">{{ t('Perataan sel') }}</span><select :aria-label="t('Perataan sel')" :value="cellAttribute('align') || ''" :disabled="!selectedTable()" @change="setCellAttributeFromEvent('align', $event)"><option value="">{{ t('Rata kiri') }}</option><option value="center">{{ t('Rata tengah') }}</option><option value="right">{{ t('Rata kanan') }}</option><option value="justify">{{ t('Rata kiri-kanan') }}</option></select></label>
        <label class="table-select"><span class="sr-only">{{ t('Perataan vertikal sel') }}</span><select :aria-label="t('Perataan vertikal sel')" :value="cellAttribute('verticalAlign') || 'top'" :disabled="!selectedTable()" @change="setCellAttributeFromEvent('verticalAlign', $event)"><option value="top">{{ t('Atas') }}</option><option value="middle">{{ t('Tengah') }}</option><option value="bottom">{{ t('Bawah') }}</option></select></label>
        <button type="button" class="editor-tool" :aria-label="t(cellBorderHidden() ? 'Tampilkan garis sel' : 'Sembunyikan garis sel')" :title="t(cellBorderHidden() ? 'Tampilkan garis sel' : 'Sembunyikan garis sel')" :aria-pressed="!cellBorderHidden()" :disabled="!selectedTable()" @click="setCellBorder"><span class="material-symbols-outlined" aria-hidden="true">border_outer</span></button>
        <label class="table-height-control"><span>{{ t('Tinggi minimum baris (px)') }}</span><input v-model="rowMinimumHeight" type="number" min="1" max="1200" inputmode="numeric" :disabled="!selectedTable()"></label>
        <button type="button" class="editor-tool" :aria-label="t('Terapkan tinggi minimum')" :title="t('Terapkan tinggi minimum')" :disabled="!selectedTable()" @click="setRowHeight()"><span class="material-symbols-outlined" aria-hidden="true">height</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Hapus tinggi minimum')" :title="t('Hapus tinggi minimum')" :disabled="!selectedTable()" @click="setRowHeight(true)"><span class="material-symbols-outlined" aria-hidden="true">remove</span></button>
      </div>
      <div class="flex rounded border border-line" role="group" :aria-label="t('Gambar')">
        <button type="button" class="editor-tool" :aria-label="t('Tambah gambar')" :title="t('Tambah gambar')" @click="fileInput?.click()"><span class="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Keterangan gambar')" :title="t('Keterangan gambar')" :disabled="!active('image')" @click="caption"><span class="material-symbols-outlined" aria-hidden="true">edit_note</span></button>
      </div>
      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" @change="addImage">
    </div>
    <dialog ref="splitDialog" class="table-split-dialog rounded-xl border border-line p-0 shadow-xl" @close="splitError = ''">
      <form class="grid gap-4 p-5" @submit.prevent="splitCell">
        <h2 class="text-lg font-semibold">{{ t('Bagi sel tabel') }}</h2>
        <label class="grid gap-1 text-sm">{{ t('Jumlah baris') }}<input v-model="splitRows" type="number" min="1" max="50" required inputmode="numeric" class="min-h-11 rounded border border-line px-3"></label>
        <label class="grid gap-1 text-sm">{{ t('Jumlah kolom') }}<input v-model="splitColumns" type="number" min="1" max="20" required inputmode="numeric" class="min-h-11 rounded border border-line px-3"></label>
        <p v-if="splitError" role="alert" class="text-sm text-danger">{{ t(splitError) }}</p>
        <div class="flex justify-end gap-2"><button type="button" class="min-h-10 rounded border border-line px-4" @click="splitDialog?.close()">{{ t('Batal') }}</button><button type="submit" class="min-h-10 rounded bg-primary px-4 text-white">{{ t('Bagi sel') }}</button></div>
      </form>
    </dialog>
    <div class="relative">
      <EditorContent :editor="editor" :style="paperStyle" class="editor-paper-surface min-w-0 overflow-x-auto rounded-xl bg-[#e8e8ec] py-6" />
    </div>
  </div>
</template>
<style scoped>
.editor-paper-surface :deep(.tiptap) {
  box-sizing: border-box;
  width: var(--paper-width);
  margin-inline: auto;
  min-height: var(--paper-height);
  padding: var(--paper-padding-y) var(--paper-padding-x);
  background: repeating-linear-gradient(to bottom, white 0 calc(var(--paper-height) - 1px), #cfd4d2 calc(var(--paper-height) - 1px) var(--paper-height), #e8e8ec var(--paper-height) calc(var(--paper-height) + var(--paper-gap)));
  box-shadow: 0 0 0 1px #cfd4d2;
  color: #111;
  font-family: 'Dokumen DejaVu Sans', 'DejaVu Sans', sans-serif;
  font-size: 11pt;
  line-height: 1.5;
  outline: none;
}
:deep(.tiptap p) { margin: 0 0 13.333px; }
:deep(.tiptap [data-font-family='Arial']) { font-family: Arial, Helvetica, sans-serif; }
:deep(.tiptap [data-font-family='Calibri']) { font-family: Calibri, Carlito, Arial, sans-serif; }
:deep(.tiptap [data-font-family='Times New Roman']) { font-family: 'Times New Roman', Times, serif; }
:deep(.tiptap [data-font-family='Aptos']) { font-family: Aptos, Calibri, Arial, sans-serif; }
:deep(.tiptap [data-font-family='Georgia']) { font-family: Georgia, serif; }
:deep(.tiptap h1), :deep(.tiptap h2), :deep(.tiptap h3), :deep(.tiptap h4), :deep(.tiptap h5), :deep(.tiptap h6) { margin: 16px 0 9.333px; }
:deep(.tiptap ul), :deep(.tiptap ol) { padding-left: 24px; }
:deep(.tiptap li) { margin-bottom: 4px; }
:deep(.tiptap table) { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 10.667px 0; }
:deep(.tiptap td), :deep(.tiptap th) { box-sizing: border-box; border: 1px solid #777; padding: 6.667px; vertical-align: top; overflow-wrap: anywhere; }
:deep(.tiptap td p:last-child), :deep(.tiptap th p:last-child) { margin-bottom: 0; }
:deep(.tiptap figure) { max-width: 100%; margin: 10.667px 0; text-align: center; }
:deep(.tiptap td figure), :deep(.tiptap th figure) { margin: 5.333px 0; }
:deep(.tiptap img) { display: block; width: auto; height: auto; max-width: 100%; max-height: 220mm; margin-inline: auto; object-fit: contain; }
:deep(.tiptap td img), :deep(.tiptap th img) { max-height: 60mm; }
:deep(.tiptap figcaption) { color: #555; font-size: 9pt; }
:deep(.editor-page-gap) { display: block; margin: 0; pointer-events: none; }
.editor-tool {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
}
.editor-tool:hover,
.editor-tool[aria-pressed='true'] {
  background: var(--color-sage);
}
.editor-tool:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}
.editor-tool:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: -2px;
}
.editor-format-summary { list-style: none; }
.editor-format-summary::-webkit-details-marker { display: none; }
.editor-format-chevron { transition: transform 180ms ease-in-out; }
.editor-format-menu[open] .editor-format-chevron { transform: rotate(90deg); }
.editor-format-item {
  display: flex;
  width: 100%;
  min-height: 2.5rem;
  align-items: center;
  gap: 0.625rem;
  border-radius: 0.375rem;
  padding: 0.5rem;
  text-align: left;
}
.editor-format-item:hover,
.editor-format-item[aria-pressed='true'] { background: var(--color-sage); }
.editor-format-item:focus-visible { outline: 2px solid var(--color-primary); outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) {
  .editor-format-chevron { transition: none; }
}
.material-symbols-outlined {
  font-size: 20px;
}
:deep(.tiptap ul) { list-style-type: disc; }
:deep(.tiptap ul ul) { list-style-type: circle; }
:deep(.tiptap ul ul ul) { list-style-type: square; }
:deep(.tiptap ol) { list-style-type: decimal; }
:deep(.tiptap ol ol) { list-style-type: lower-alpha; }
:deep(.tiptap ol ol ol) { list-style-type: lower-roman; }
:deep(.tiptap .tableWrapper) { max-width: 100%; overflow-x: auto; }
:deep(.tiptap td.selectedCell),
:deep(.tiptap th.selectedCell) { background-color: #eaf1fd; }
:deep(.tiptap .validation-cell) { outline: 2px solid var(--color-error); outline-offset: -2px; }
:deep(.tiptap table[data-show-borders="false"] th),
:deep(.tiptap table[data-show-borders="false"] td) { border-color: transparent; }
:deep(.tiptap td[data-cell-color="gray"]), :deep(.tiptap th[data-cell-color="gray"]) { background-color: #f1f5f9; }
:deep(.tiptap td[data-cell-color="blue"]), :deep(.tiptap th[data-cell-color="blue"]) { background-color: #dbeafe; }
:deep(.tiptap td[data-cell-color="green"]), :deep(.tiptap th[data-cell-color="green"]) { background-color: #dcfce7; }
:deep(.tiptap td[data-cell-color="yellow"]), :deep(.tiptap th[data-cell-color="yellow"]) { background-color: #fef3c7; }
:deep(.tiptap td[data-cell-color="orange"]), :deep(.tiptap th[data-cell-color="orange"]) { background-color: #ffedd5; }
:deep(.tiptap td[data-cell-color="red"]), :deep(.tiptap th[data-cell-color="red"]) { background-color: #fee2e2; }
:deep(.tiptap td[data-cell-color="purple"]), :deep(.tiptap th[data-cell-color="purple"]) { background-color: #f3e8ff; }
:deep(.tiptap td[data-vertical-align="middle"]), :deep(.tiptap th[data-vertical-align="middle"]) { vertical-align: middle; }
:deep(.tiptap td[data-vertical-align="bottom"]), :deep(.tiptap th[data-vertical-align="bottom"]) { vertical-align: bottom; }
:deep(.tiptap td[data-cell-border="false"]), :deep(.tiptap th[data-cell-border="false"]) { border-color: transparent; }
:deep(.tiptap td[data-cell-border="true"]), :deep(.tiptap th[data-cell-border="true"]) { border: 1px solid #777; }
.table-select select { min-height: 2.25rem; max-width: 9rem; border: 1px solid var(--color-line); border-radius: .375rem; background: white; padding-inline: .5rem; font-size: .75rem; }
.table-height-control { display: inline-flex; align-items: center; gap: .375rem; font-size: .75rem; }
.table-height-control input { width: 5rem; min-height: 2.25rem; border: 1px solid var(--color-line); border-radius: .375rem; padding-inline: .5rem; }
.table-split-dialog { width: min(24rem, calc(100vw - 2rem)); }
.table-split-dialog::backdrop { background: rgb(15 23 42 / 35%); }
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { Editor, EditorContent, Extension, Mark, mergeAttributes } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorData } from '../../types/documents'
import { editorPayload } from '../../utils/editor'
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
        TableKit.configure({ table: { allowTableNodeSelection: true } }),
        TableBorders,
        DocumentFontFamily,
        PaperPages,
        DocumentImage,
        Highlight,
        TextAlign.configure({ types: ['paragraph', 'heading'], defaultAlignment: 'left' }),
      ],
      onUpdate() {
        toolbarVersion.value++
        emit('pending')
        void capture()
      },
      onSelectionUpdate() { toolbarVersion.value++ },
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
      </div>
      <div class="flex rounded border border-line" role="group" :aria-label="t('Gambar')">
        <button type="button" class="editor-tool" :aria-label="t('Tambah gambar')" :title="t('Tambah gambar')" @click="fileInput?.click()"><span class="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span></button>
        <button type="button" class="editor-tool" :aria-label="t('Keterangan gambar')" :title="t('Keterangan gambar')" :disabled="!active('image')" @click="caption"><span class="material-symbols-outlined" aria-hidden="true">edit_note</span></button>
      </div>
      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" @change="addImage">
    </div>
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
</style>

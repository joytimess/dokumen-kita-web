<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { Editor, EditorContent, Extension } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { NodeSelection } from '@tiptap/pm/state'
import type { EditorData } from '../../types/documents'
import { editorPayload } from '../../utils/editor'
import { editorDataToHtml, tiptapToEditorData, type TiptapNode } from '../../utils/tiptap'
import FeedbackMessage from '../ui/FeedbackMessage.vue'

const props = defineProps<{ data: EditorData; readonly?: boolean }>()
const emit = defineEmits<{ change: [data: EditorData]; pending: []; invalid: [message: string] }>()
const editor = shallowRef<Editor>()
const fileInput = ref<HTMLInputElement>()
const boundaryGuide = ref<HTMLDivElement>()
const error = ref('')
const toolbarVersion = ref(0)
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
function updateTableCursor(event: MouseEvent) {
  const view = editor.value?.view
  const guide = boundaryGuide.value
  if (!view || !guide) return
  clearTableCursor()
  const target = event.target
  const cell = target instanceof Element ? target.closest('td, th') : null
  const row = cell?.closest('tr')
  const bounds = cell?.getBoundingClientRect()
  if (!cell || !row || !bounds || !view.dom.contains(cell) || props.readonly || locked) return
  let edge: 'left' | 'right' | 'top' | 'bottom' | null = null
  if (cell.previousElementSibling && Math.abs(event.clientX - bounds.left) <= 4) edge = 'left'
  else if (cell.nextElementSibling && Math.abs(event.clientX - bounds.right) <= 4) edge = 'right'
  else if (row.previousElementSibling && Math.abs(event.clientY - bounds.top) <= 4) edge = 'top'
  else if (row.nextElementSibling && Math.abs(event.clientY - bounds.bottom) <= 4) edge = 'bottom'
  if (!edge) return
  const table = cell.closest('table')
  const wrapper = cell.closest('.tableWrapper')
  const surface = guide.parentElement
  if (!table || !wrapper || !surface) return
  const tableBounds = table.getBoundingClientRect()
  const wrapperBounds = wrapper.getBoundingClientRect()
  const surfaceBounds = surface.getBoundingClientRect()
  const vertical = edge === 'left' || edge === 'right'
  const x = edge === 'left' ? bounds.left : bounds.right
  const y = edge === 'top' ? bounds.top : bounds.bottom
  if (vertical && (x < wrapperBounds.left || x > wrapperBounds.right)) return
  guide.style.left = `${(vertical ? x : Math.max(tableBounds.left, wrapperBounds.left)) - surfaceBounds.left - (vertical ? 2 : 0)}px`
  guide.style.top = `${(vertical ? tableBounds.top : y) - surfaceBounds.top - (vertical ? 0 : 2)}px`
  guide.style.width = `${vertical ? 4 : Math.min(tableBounds.right, wrapperBounds.right) - Math.max(tableBounds.left, wrapperBounds.left)}px`
  guide.style.height = `${vertical ? tableBounds.height : 4}px`
  guide.hidden = false
  view.dom.classList.add(edge === 'left' || edge === 'right' ? 'column-boundary-cursor' : 'row-resize-cursor')
}
function clearTableCursor() {
  if (boundaryGuide.value) boundaryGuide.value.hidden = true
  editor.value?.view.dom.classList.remove('column-boundary-cursor', 'row-resize-cursor')
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
async function lock() {
  locked = true
  clearTableCursor()
  editor.value?.setEditable(false)
}
defineExpose({ capture, render, lock })

function formatBlock(event: Event) {
  const level = Number((event.target as HTMLSelectElement).value)
  if (!editor.value || locked) return
  if (level) editor.value.chain().focus().setHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run()
  else editor.value.chain().focus().setParagraph().run()
}
function link() {
  if (!editor.value || locked) return
  const href = window.prompt('Alamat tautan HTTPS, HTTP, atau mailto:', editor.value.getAttributes('link').href ?? 'https://')
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
  const text = window.prompt('Keterangan gambar:', String(editor.value.getAttributes('image').caption ?? ''))
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
  if (value) clearTableCursor()
  if (!locked) editor.value?.setEditable(!value)
})
onMounted(() => {
  try {
    editor.value = new Editor({
      content: editorDataToHtml(editorPayload(props.data)),
      editable: !props.readonly,
      extensions: [
        StarterKit.configure({ blockquote: false, codeBlock: false, horizontalRule: false, strike: false }),
        TableKit.configure({ table: { resizable: true, allowTableNodeSelection: true } }),
        TableBorders,
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
    editor.value.view.dom.addEventListener('mousemove', updateTableCursor)
    editor.value.view.dom.addEventListener('mouseleave', clearTableCursor)
  } catch {
    error.value = 'Editor belum dapat dimuat. Muat ulang halaman.'
    emit('invalid', error.value)
  }
})
onUnmounted(() => {
  disposed = true
  editor.value?.view.dom.removeEventListener('mousemove', updateTableCursor)
  editor.value?.view.dom.removeEventListener('mouseleave', clearTableCursor)
  editor.value?.destroy()
  editor.value = undefined
})
</script>
<template>
  <div>
    <FeedbackMessage :message="error" error />
    <div v-if="editor && !readonly" role="toolbar" aria-label="Format dokumen" class="mb-2 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-white p-2 text-ink">
      <select class="h-10 rounded border border-line bg-white px-2 text-sm" aria-label="Jenis paragraf" title="Jenis paragraf" @change="formatBlock">
        <option value="0">Normal</option>
        <option v-for="level in 6" :key="level" :value="level">Judul {{ level }}</option>
      </select>
      <div class="flex rounded border border-line" role="group" aria-label="Gaya teks">
        <button type="button" class="editor-tool" aria-label="Tebal" title="Tebal" :aria-pressed="active('bold')" @click="editor.chain().focus().toggleBold().run()"><span class="material-symbols-outlined" aria-hidden="true">format_bold</span></button>
        <button type="button" class="editor-tool" aria-label="Miring" title="Miring" :aria-pressed="active('italic')" @click="editor.chain().focus().toggleItalic().run()"><span class="material-symbols-outlined" aria-hidden="true">format_italic</span></button>
        <button type="button" class="editor-tool" aria-label="Garis bawah" title="Garis bawah" :aria-pressed="active('underline')" @click="editor.chain().focus().toggleUnderline().run()"><span class="material-symbols-outlined" aria-hidden="true">format_underlined</span></button>
        <button type="button" class="editor-tool" aria-label="Sorot" title="Sorot" :aria-pressed="active('highlight')" @click="editor.chain().focus().toggleHighlight().run()"><span class="material-symbols-outlined" aria-hidden="true">ink_highlighter</span></button>
      </div>
      <div class="flex rounded border border-line" role="group" aria-label="Perataan paragraf">
        <button type="button" class="editor-tool" aria-label="Rata kiri" title="Rata kiri" :aria-pressed="aligned('left')" @click="editor.chain().focus().setTextAlign('left').run()"><span class="material-symbols-outlined" aria-hidden="true">format_align_left</span></button>
        <button type="button" class="editor-tool" aria-label="Rata tengah" title="Rata tengah" :aria-pressed="aligned('center')" @click="editor.chain().focus().setTextAlign('center').run()"><span class="material-symbols-outlined" aria-hidden="true">format_align_center</span></button>
        <button type="button" class="editor-tool" aria-label="Rata kanan" title="Rata kanan" :aria-pressed="aligned('right')" @click="editor.chain().focus().setTextAlign('right').run()"><span class="material-symbols-outlined" aria-hidden="true">format_align_right</span></button>
        <button type="button" class="editor-tool" aria-label="Rata kiri-kanan" title="Rata kiri-kanan (justify)" :aria-pressed="aligned('justify')" @click="editor.chain().focus().setTextAlign('justify').run()"><span class="material-symbols-outlined" aria-hidden="true">format_align_justify</span></button>
      </div>
      <div class="flex rounded border border-line" role="group" aria-label="Daftar dan tautan">
        <button type="button" class="editor-tool" aria-label="Daftar poin" title="Daftar poin" :aria-pressed="active('bulletList')" @click="editor.chain().focus().toggleBulletList().run()"><span class="material-symbols-outlined" aria-hidden="true">format_list_bulleted</span></button>
        <button type="button" class="editor-tool" aria-label="Daftar nomor" title="Daftar nomor" :aria-pressed="active('orderedList')" @click="editor.chain().focus().toggleOrderedList().run()"><span class="material-symbols-outlined" aria-hidden="true">format_list_numbered</span></button>
        <button type="button" class="editor-tool" aria-label="Kurangi tingkat daftar" title="Kurangi tingkat daftar (Shift+Tab)" :disabled="!editor.can().liftListItem('listItem')" @click="editor.chain().focus().liftListItem('listItem').run()"><span class="material-symbols-outlined" aria-hidden="true">format_indent_decrease</span></button>
        <button type="button" class="editor-tool" aria-label="Tambah tingkat daftar" title="Tambah tingkat daftar (Tab)" :disabled="listDepth() >= 3 || !editor.can().sinkListItem('listItem')" @click="indentList"><span class="material-symbols-outlined" aria-hidden="true">format_indent_increase</span></button>
        <button type="button" class="editor-tool" aria-label="Tautan" title="Tautan" @click="link"><span class="material-symbols-outlined" aria-hidden="true">link</span></button>
      </div>
      <div class="flex rounded border border-line" role="group" aria-label="Tabel">
        <button type="button" class="editor-tool" aria-label="Buat tabel" title="Buat tabel" @click="editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: true }).run()"><span class="material-symbols-outlined" aria-hidden="true">table_chart</span></button>
        <button type="button" class="editor-tool" aria-label="Tambah kolom sebelum" title="Tambah kolom sebelum" :disabled="!editor.can().addColumnBefore()" @click="editor.chain().focus().addColumnBefore().run()"><span class="material-symbols-outlined" aria-hidden="true">add_column_left</span></button>
        <button type="button" class="editor-tool" aria-label="Tambah kolom sesudah" title="Tambah kolom sesudah" :disabled="!editor.can().addColumnAfter()" @click="editor.chain().focus().addColumnAfter().run()"><span class="material-symbols-outlined" aria-hidden="true">add_column_right</span></button>
        <button type="button" class="editor-tool" aria-label="Hapus kolom" title="Hapus kolom" :disabled="!editor.can().deleteColumn()" @click="editor.chain().focus().deleteColumn().run()"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
        <button type="button" class="editor-tool" aria-label="Tambah baris sebelum" title="Tambah baris sebelum" :disabled="!editor.can().addRowBefore()" @click="editor.chain().focus().addRowBefore().run()"><span class="material-symbols-outlined" aria-hidden="true">add_row_above</span></button>
        <button type="button" class="editor-tool" aria-label="Tambah baris sesudah" title="Tambah baris sesudah" :disabled="!editor.can().addRowAfter()" @click="editor.chain().focus().addRowAfter().run()"><span class="material-symbols-outlined" aria-hidden="true">add_row_below</span></button>
        <button type="button" class="editor-tool" aria-label="Hapus baris" title="Hapus baris" :disabled="!editor.can().deleteRow()" @click="editor.chain().focus().deleteRow().run()"><span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span></button>
        <button type="button" class="editor-tool" aria-label="Hapus tabel" title="Hapus tabel" :disabled="!editor.can().deleteTable()" @click="editor.chain().focus().deleteTable().run()"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
        <button type="button" class="editor-tool" aria-label="Pindahkan tabel ke atas" title="Pindahkan tabel ke atas" :disabled="!canMoveTable('up')" @click="moveTable('up')"><span class="material-symbols-outlined" aria-hidden="true">arrow_upward</span></button>
        <button type="button" class="editor-tool" aria-label="Pindahkan tabel ke bawah" title="Pindahkan tabel ke bawah" :disabled="!canMoveTable('down')" @click="moveTable('down')"><span class="material-symbols-outlined" aria-hidden="true">arrow_downward</span></button>
        <button type="button" class="editor-tool" :aria-label="tableLinesHidden() ? 'Tampilkan garis tabel' : 'Sembunyikan garis tabel'" :title="tableLinesHidden() ? 'Tampilkan garis tabel' : 'Sembunyikan garis tabel'" :disabled="!selectedTable()" @click="toggleTableLines"><span class="material-symbols-outlined" aria-hidden="true">{{ tableLinesHidden() ? 'visibility' : 'visibility_off' }}</span></button>
      </div>
      <div class="flex rounded border border-line" role="group" aria-label="Gambar">
        <button type="button" class="editor-tool" aria-label="Tambah gambar" title="Tambah gambar" @click="fileInput?.click()"><span class="material-symbols-outlined" aria-hidden="true">add_photo_alternate</span></button>
        <button type="button" class="editor-tool" aria-label="Keterangan gambar" title="Keterangan gambar" :disabled="!active('image')" @click="caption"><span class="material-symbols-outlined" aria-hidden="true">edit_note</span></button>
      </div>
      <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" @change="addImage">
    </div>
    <div class="relative">
      <EditorContent :editor="editor" class="min-h-80 min-w-0 rounded-xl border border-line bg-white px-3 py-6 text-sm sm:px-12 [&_.tiptap]:min-h-64 [&_.tiptap]:outline-none [&_.tiptap_p]:mb-3 [&_.tiptap_h1]:text-3xl [&_.tiptap_h2]:text-2xl [&_.tiptap_h3]:text-xl [&_.tiptap_h1]:font-semibold [&_.tiptap_h2]:font-semibold [&_.tiptap_h3]:font-semibold [&_.tiptap_ul]:list-disc [&_.tiptap_ol]:list-decimal [&_.tiptap_ul]:pl-6 [&_.tiptap_ol]:pl-6 [&_.tiptap_table]:w-full [&_.tiptap_table]:border-collapse [&_.tiptap_td]:border [&_.tiptap_th]:border [&_.tiptap_td]:p-2 [&_.tiptap_th]:p-2 [&_.tiptap_img]:max-w-full" />
      <div ref="boundaryGuide" hidden class="table-boundary-guide" aria-hidden="true" />
    </div>
  </div>
</template>
<style scoped>
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
:deep(.tiptap table) { min-width: max-content; }
:deep(.tiptap td),
:deep(.tiptap th) { position: relative; }
:deep(.tiptap .column-resize-handle) { position: absolute; top: 0; right: -2px; bottom: 0; width: 4px; pointer-events: none; }
.table-boundary-guide { position: absolute; z-index: 10; background: #4285f4; pointer-events: none; }
.table-boundary-guide[hidden] { display: none; }
:deep(.tiptap.row-resize-cursor td),
:deep(.tiptap.row-resize-cursor th) { cursor: row-resize; }
:deep(.tiptap.column-boundary-cursor td),
:deep(.tiptap.column-boundary-cursor th) { cursor: col-resize; }
:deep(.tiptap.resize-cursor),
:deep(.tiptap.resize-cursor td),
:deep(.tiptap.resize-cursor th) { cursor: col-resize; }
:deep(.tiptap td.selectedCell),
:deep(.tiptap th.selectedCell) { background-color: #eaf1fd; }
:deep(.tiptap table[data-show-borders="false"] th),
:deep(.tiptap table[data-show-borders="false"] td) { border-color: transparent; }
</style>

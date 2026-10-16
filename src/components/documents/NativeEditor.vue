<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { Editor, EditorContent, Extension } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorData } from '../../types/documents'
import { editorPayload } from '../../utils/editor'
import { editorDataToHtml, tiptapToEditorData, type TiptapNode } from '../../utils/tiptap'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import { confirmAction } from '../../services/feedback'

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
async function removeTablePart(part: 'column' | 'row' | 'table') {
  const label = { column: 'kolom', row: 'baris', table: 'tabel' }[part]
  if (!(await confirmAction(`Hapus ${label} ini dari dokumen?`, {
    title: `Hapus ${label}`, action: 'Hapus', danger: true,
  }))) return
  if (part === 'column') editor.value?.chain().focus().deleteColumn().run()
  else if (part === 'row') editor.value?.chain().focus().deleteRow().run()
  else editor.value?.chain().focus().deleteTable().run()
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

const paperHeight = 1123
const paperGap = 24
const paperPadding = 72
const paperStride = paperHeight + paperGap
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
          let y = paperPadding
          const gaps: { position: number; height: number }[] = []
          view.state.doc.forEach((_node, position) => {
            const element = view.nodeDOM(position)
            if (!(element instanceof HTMLElement)) return
            const style = getComputedStyle(element)
            const height = element.getBoundingClientRect().height + (parseFloat(style.marginBottom) || 0)
            const page = Math.floor(y / paperStride)
            const pageEnd = page * paperStride + paperHeight - paperPadding
            if (height <= paperHeight - paperPadding * 2 && y + height > pageEnd) {
              const gap = (page + 1) * paperStride + paperPadding - y
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
  clearTableCursor()
  editor.value?.setEditable(false)
}
defineExpose({ capture, render, lock, showCellError })

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
        <button type="button" class="editor-tool" aria-label="Hapus kolom" title="Hapus kolom" :disabled="!editor.can().deleteColumn()" @click="removeTablePart('column')"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
        <button type="button" class="editor-tool" aria-label="Tambah baris sebelum" title="Tambah baris sebelum" :disabled="!editor.can().addRowBefore()" @click="editor.chain().focus().addRowBefore().run()"><span class="material-symbols-outlined" aria-hidden="true">add_row_above</span></button>
        <button type="button" class="editor-tool" aria-label="Tambah baris sesudah" title="Tambah baris sesudah" :disabled="!editor.can().addRowAfter()" @click="editor.chain().focus().addRowAfter().run()"><span class="material-symbols-outlined" aria-hidden="true">add_row_below</span></button>
        <button type="button" class="editor-tool" aria-label="Hapus baris" title="Hapus baris" :disabled="!editor.can().deleteRow()" @click="removeTablePart('row')"><span class="material-symbols-outlined" aria-hidden="true">delete_sweep</span></button>
        <button type="button" class="editor-tool" aria-label="Hapus tabel" title="Hapus tabel" :disabled="!editor.can().deleteTable()" @click="removeTablePart('table')"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
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
      <EditorContent :editor="editor" class="editor-paper-surface min-w-0 overflow-x-auto rounded-xl bg-[#e8e8ec] py-6 text-sm [&_.tiptap]:mx-auto [&_.tiptap]:min-h-[1123px] [&_.tiptap]:outline-none [&_.tiptap_p]:mb-3 [&_.tiptap_h1]:text-3xl [&_.tiptap_h2]:text-2xl [&_.tiptap_h3]:text-xl [&_.tiptap_h1]:font-semibold [&_.tiptap_h2]:font-semibold [&_.tiptap_h3]:font-semibold [&_.tiptap_ul]:list-disc [&_.tiptap_ol]:list-decimal [&_.tiptap_ul]:pl-6 [&_.tiptap_ol]:pl-6 [&_.tiptap_table]:w-full [&_.tiptap_table]:border-collapse [&_.tiptap_td]:border [&_.tiptap_th]:border [&_.tiptap_td]:p-2 [&_.tiptap_th]:p-2 [&_.tiptap_img]:max-w-full" />
      <div ref="boundaryGuide" hidden class="table-boundary-guide" aria-hidden="true" />
    </div>
  </div>
</template>
<style scoped>
.editor-paper-surface :deep(.tiptap) {
  box-sizing: border-box;
  width: min(100%, 794px);
  padding: 72px clamp(24px, 8%, 64px);
  background: repeating-linear-gradient(to bottom, white 0 1122px, #cfd4d2 1122px 1123px, #e8e8ec 1123px 1147px);
  box-shadow: 0 0 0 1px #cfd4d2;
}
.editor-paper-surface :deep(.editor-page-gap) { display: block; margin: 0; pointer-events: none; }
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
:deep(.tiptap .validation-cell) { outline: 2px solid var(--color-error); outline-offset: -2px; }
:deep(.tiptap table[data-show-borders="false"] th),
:deep(.tiptap table[data-show-borders="false"] td) { border-color: transparent; }
</style>

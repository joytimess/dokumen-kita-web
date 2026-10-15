<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import EditorJS, { type ToolConstructable } from '@editorjs/editorjs'
import Header from '@editorjs/header'
import List from '@editorjs/list'
import Table from '@editorjs/table'
import ImageTool from '@editorjs/image'
import type { EditorData } from '../../types/documents'
import { editorPayload, editorDisplayData } from '../../utils/editor'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
const props = defineProps<{ data: EditorData; readonly?: boolean }>()
const emit = defineEmits<{ change: [data: EditorData]; pending: []; invalid: [message: string] }>()
const holder = ref<HTMLDivElement>()
const error = ref('')
let editor: EditorJS | undefined
let disposed = false,
  muted = false,
  sequence = 0
async function capture() {
  if (!editor || disposed) return
  const serial = ++sequence
  try {
    const output = await editor.save()
    if (serial !== sequence || disposed) return
    const payload = editorPayload(output)
    error.value = ''
    emit('change', payload)
    return payload
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Isi editor belum dapat dibaca.'
    emit('invalid', error.value)
  }
}
async function render(data: EditorData) {
  if (!editor || disposed) return
  await editor.isReady
  muted = true
  try {
    await editor.render(editorDisplayData(data))
  } finally {
    muted = false
  }
}
async function lock() {
  if (editor) {
    await editor.isReady
    await editor.readOnly.toggle(true)
  }
}
defineExpose({ capture, render, lock })
onMounted(async () => {
  try {
    editor = new EditorJS({
      holder: holder.value,
      data: editorDisplayData(props.data),
      readOnly: props.readonly,
      minHeight: 240,
      placeholder: 'Mulai menulis isi dokumen Anda…',
      tools: {
        header: {
          class: Header as unknown as ToolConstructable,
          config: { levels: [1, 2, 3, 4, 5, 6], defaultLevel: 2 },
        },
        list: {
          class: List as unknown as ToolConstructable,
          config: { maxLevel: 3, defaultStyle: 'unordered' },
        },
        table: Table as unknown as ToolConstructable,
        image: {
          class: ImageTool as unknown as ToolConstructable,
          config: {
            uploader: {
              uploadByFile(file: File) {
                return new Promise((resolve, reject) => {
                  if (
                    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
                    file.size > 500000
                  ) {
                    reject(new Error('Gunakan PNG/JPEG/WebP maksimal 500 KB.'))
                    return
                  }
                  const reader = new FileReader()
                  reader.onerror = reject
                  reader.onload = () => resolve({ success: 1, file: { url: reader.result } })
                  reader.readAsDataURL(file)
                })
              },
              uploadByUrl() {
                return Promise.reject(
                  new Error('URL gambar remote tidak didukung. Unggah gambar lokal.'),
                )
              },
            },
            features: { border: false, caption: true, stretch: false, background: false },
          },
        },
      },
      onChange() {
        if (!muted) {
          emit('pending')
          void capture()
        }
      },
    })
    await editor.isReady
    if (disposed) editor.destroy()
  } catch {
    error.value = 'Editor belum dapat dimuat. Muat ulang halaman.'
    emit('invalid', error.value)
  }
})
onUnmounted(() => {
  disposed = true
  sequence++
  if (editor?.destroy) editor.destroy()
  editor = undefined
})
</script>
<template>
  <div>
    <FeedbackMessage :message="error" error />
    <div
      ref="holder"
      class="min-h-80 min-w-0 rounded-xl border border-line bg-white px-3 py-6 text-sm sm:px-12 [&_.ce-block__content]:max-w-none [&_.ce-toolbar__content]:max-w-none [&_.ce-header]:font-semibold [&_.ce-header]:text-2xl [&_.cdx-block]:leading-relaxed [&_img]:max-w-full [&_table]:max-w-full [&_.tc-wrap]:overflow-x-auto"
    ></div>
  </div>
</template>

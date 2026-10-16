<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { confirmAction, notify } from '../../services/feedback'
const emit = defineEmits<{ created: [file: File] }>()
const canvas = ref<HTMLCanvasElement>()
const ink = ref(false),
  error = ref('')
let drawing = false
function point(event: PointerEvent) {
  const bounds = canvas.value!.getBoundingClientRect()
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * 800,
    y: ((event.clientY - bounds.top) / bounds.height) * 300,
  }
}
function start(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const c = canvas.value!,
    p = point(event),
    ctx = c.getContext('2d')!
  c.setPointerCapture(event.pointerId)
  drawing = true
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
  ctx.lineTo(p.x + 0.1, p.y + 0.1)
  ctx.stroke()
  ink.value = true
}
function move(event: PointerEvent) {
  if (drawing) {
    const p = point(event),
      ctx = canvas.value!.getContext('2d')!
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
  }
}
async function clear() {
  if (ink.value && !(await confirmAction('Hapus coretan tanda tangan ini?', {
    title: 'Hapus coretan', action: 'Hapus', danger: true,
  }))) return
  canvas.value?.getContext('2d')?.clearRect(0, 0, 800, 300)
  ink.value = false
  error.value = ''
}
function use() {
  const pixels = canvas.value!.getContext('2d')!.getImageData(0, 0, 800, 300).data
  let painted = 0
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) painted++
  if (painted < 10) {
    error.value = 'Buat coretan tanda tangan terlebih dahulu.'
    notify.error(error.value)
    return
  }
  canvas.value!.toBlob((blob) => {
    if (blob) emit('created', new File([blob], 'tanda-tangan.png', { type: 'image/png' }))
  }, 'image/png')
}
onMounted(() => {
  const ctx = canvas.value!.getContext('2d')!
  ctx.strokeStyle = '#173d35'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
})
</script>
<template>
  <div>
    <p class="mb-3 text-xs text-muted">
      Gambar dengan mouse atau sentuhan. Gunakan unggah gambar sebagai alternatif.
    </p>
    <canvas
      ref="canvas"
      width="800"
      height="300"
      class="w-full touch-none rounded-lg border border-dashed border-primary bg-white"
      aria-label="Area menggambar tanda tangan"
      @pointerdown.prevent="start"
      @pointermove.prevent="move"
      @pointerup="drawing = false"
      @pointercancel="drawing = false"
    ></canvas>
    <p v-if="error" role="alert" class="mt-2 text-xs text-error">{{ error }}</p>
    <div class="mt-3 flex flex-wrap gap-4">
      <button type="button" class="min-h-11 text-sm text-primary underline" @click="clear">
        Hapus coretan</button
      ><button
        type="button"
        class="min-h-11 rounded border border-line px-4 text-sm text-primary disabled:opacity-40"
        :disabled="!ink"
        @click="use"
      >
        Gunakan coretan
      </button>
    </div>
  </div>
</template>

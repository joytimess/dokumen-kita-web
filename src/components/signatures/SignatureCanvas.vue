<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import SignaturePad from 'signature_pad'
import { confirmAction, notify } from '../../services/feedback'
import { t } from '../../services/workspace-language'
const props = withDefaults(defineProps<{ active?: boolean; disabled?: boolean }>(), { active: true })
const emit = defineEmits<{ created: [file: File] }>()
const canvas = ref<HTMLCanvasElement>()
const ink = ref(false),
  error = ref('')
let pad: SignaturePad | undefined
let observer: ResizeObserver | undefined
let resolution: MediaQueryList | undefined
let width = 0
let height = 0
let drawing = false
let listening = true
let disposed = false

function resize() {
  const element = canvas.value
  if (!element || !pad || drawing) return
  const bounds = element.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  const ratio = Math.max(window.devicePixelRatio || 1, 1)
  const pixelWidth = Math.round(bounds.width * ratio)
  const pixelHeight = Math.round(bounds.height * ratio)
  if (element.width === pixelWidth && element.height === pixelHeight && width === bounds.width && height === bounds.height) return
  // The fixed 8:3 canvas ratio lets strokes scale uniformly without distortion.
  const scale = width ? bounds.width / width : 1
  const data = pad.toData().map((group) => ({
    ...group,
    minWidth: group.minWidth * scale,
    maxWidth: group.maxWidth * scale,
    dotSize: group.dotSize * scale,
    points: group.points.map((point) => ({ ...point, x: point.x * scale, y: point.y * scale })),
  }))
  element.width = pixelWidth
  element.height = pixelHeight
  element.getContext('2d')!.setTransform(pixelWidth / bounds.width, 0, 0, pixelHeight / bounds.height, 0, 0)
  pad.fromData(data)
  width = bounds.width
  height = bounds.height
  ink.value = !pad.isEmpty()
}

function watchResolution() {
  resolution?.removeEventListener('change', watchResolution)
  resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
  resolution.addEventListener('change', watchResolution)
  resize()
}

function syncEnabled() {
  if (!pad) return
  const enabled = props.active && !props.disabled
  if (enabled !== listening) {
    if (enabled) pad.on()
    else pad.off()
    listening = enabled
    drawing = false
  }
  if (enabled) resize()
}

function beginStroke() {
  drawing = true
}
function endStroke() {
  drawing = false
  ink.value = !pad!.isEmpty()
  resize()
}

async function clear() {
  if (props.disabled) return
  if (ink.value && !(await confirmAction('Hapus coretan tanda tangan ini?', {
    title: t('Hapus coretan'), action: t('Hapus'), danger: true,
  }))) return
  if (disposed) return
  pad?.clear()
  ink.value = false
  error.value = ''
}
function use() {
  if (!pad || props.disabled || drawing) return
  const element = canvas.value!
  const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data
  let painted = 0
  for (let i = 3; i < pixels.length && painted < 10; i += 4) if (pixels[i]! > 0) painted++
  if (pad.isEmpty() || painted < 10) {
    error.value = 'Buat coretan tanda tangan terlebih dahulu.'
    notify.error(error.value)
    return
  }
  // Keep HiDPI exports within the existing signature asset dimensions.
  const scale = Math.min(1, 2048 / element.width, 1024 / element.height)
  const output = document.createElement('canvas')
  output.width = Math.round(element.width * scale)
  output.height = Math.round(element.height * scale)
  const context = output.getContext('2d')!
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(element, 0, 0, output.width, output.height)
  output.toBlob((blob) => {
    if (disposed) return
    if (blob) emit('created', new File([blob], 'tanda-tangan.png', { type: 'image/png' }))
    else {
      error.value = 'Coretan gagal diproses. Silakan coba lagi.'
      notify.error(error.value)
    }
  }, 'image/png')
}
watch(() => [props.active, props.disabled], syncEnabled, { flush: 'post' })
onMounted(() => {
  pad = new SignaturePad(canvas.value!, {
    minWidth: 1.5, maxWidth: 3, penColor: '#174C3C',
    velocityFilterWeight: 0.7, throttle: 16, minDistance: 2,
  })
  pad.addEventListener('beginStroke', beginStroke)
  pad.addEventListener('endStroke', endStroke)
  observer = new ResizeObserver(resize)
  observer.observe(canvas.value!)
  window.addEventListener('resize', resize)
  watchResolution()
  syncEnabled()
})
onUnmounted(() => {
  disposed = true
  observer?.disconnect()
  window.removeEventListener('resize', resize)
  resolution?.removeEventListener('change', watchResolution)
  pad?.removeEventListener('beginStroke', beginStroke)
  pad?.removeEventListener('endStroke', endStroke)
  pad?.off()
})
</script>
<template>
  <div>
    <p class="mb-3 text-xs text-muted">
      {{ t('Gambar dengan mouse atau sentuhan. Gunakan unggah gambar sebagai alternatif.') }}
    </p>
    <canvas
      ref="canvas"
      width="800"
      height="300"
      class="block aspect-[8/3] w-full touch-none rounded-lg border border-dashed border-primary bg-white"
      :aria-label="t('Area menggambar tanda tangan')"
    ></canvas>
    <p v-if="error" role="alert" class="mt-2 text-xs text-error">{{ t(error) }}</p>
    <div class="mt-3 flex flex-wrap gap-4">
      <button type="button" class="min-h-11 text-sm text-primary underline" :disabled="disabled" @click="clear">
        {{ t('Hapus coretan') }}</button
      ><button
        type="button"
        class="min-h-11 rounded border border-line px-4 text-sm text-primary disabled:opacity-40"
        :disabled="!ink || disabled"
        @click="use"
      >
        {{ t('Gunakan coretan') }}
      </button>
    </div>
  </div>
</template>

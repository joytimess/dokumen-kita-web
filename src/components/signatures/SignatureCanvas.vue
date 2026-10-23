<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import SignaturePad from 'signature_pad'
import { confirmAction, notify } from '../../services/feedback'
import { t } from '../../services/workspace-language'
import BaseButton from '../ui/BaseButton.vue'
const props = withDefaults(defineProps<{ active?: boolean; disabled?: boolean; verifying?: boolean }>(), { active: true })
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
let resizeSource: { data: ReturnType<SignaturePad['toData']>; width: number; height: number } | undefined

function resize() {
  const element = canvas.value
  if (!element || !pad || drawing) return
  const bounds = element.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  const ratio = Math.max(window.devicePixelRatio || 1, 1)
  const pixelWidth = Math.round(bounds.width * ratio)
  const pixelHeight = Math.round(bounds.height * ratio)
  if (element.width === pixelWidth && element.height === pixelHeight && width === bounds.width && height === bounds.height) return
  // Keep a stable source so changing aspect ratios does not distort or progressively shrink strokes.
  resizeSource ??= { data: pad.toData(), width: width || bounds.width, height: height || bounds.height }
  const scale = Math.min(bounds.width / resizeSource.width, bounds.height / resizeSource.height)
  const data = resizeSource.data.map((group) => ({
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
  resizeSource = undefined
  drawing = true
}
function endStroke() {
  drawing = false
  ink.value = !pad!.isEmpty()
  resize()
}

async function clear() {
  if (props.disabled || props.verifying || !ink.value) return
  if (ink.value && !(await confirmAction('Hapus coretan tanda tangan ini?', {
    title: t('Hapus coretan'), action: t('Hapus'), danger: true,
  }))) return
  if (disposed) return
  pad?.clear()
  resizeSource = undefined
  ink.value = false
  error.value = ''
}
function use() {
  if (!pad || props.disabled || props.verifying || drawing) return
  const element = canvas.value!
  const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data
  let painted = 0, left = element.width, top = element.height, right = -1, bottom = -1
  for (let y = 0; y < element.height; y++) {
    for (let x = 0; x < element.width; x++) {
      if (!pixels[(y * element.width + x) * 4 + 3]) continue
      painted++
      left = Math.min(left, x)
      top = Math.min(top, y)
      right = Math.max(right, x)
      bottom = Math.max(bottom, y)
    }
  }
  if (pad.isEmpty() || painted < 10) {
    error.value = 'Buat coretan tanda tangan terlebih dahulu.'
    notify.error(error.value)
    return
  }
  const strokeWidth = right - left + 1, strokeHeight = bottom - top + 1
  const padding = Math.round(12 * Math.max(window.devicePixelRatio || 1, 1))
  // Crop only on export; leave the drawing surface and transparent pixels intact.
  const cropWidth = strokeWidth + padding * 2, cropHeight = strokeHeight + padding * 2
  const scale = Math.min(1, 2048 / cropWidth, 1024 / cropHeight)
  const output = document.createElement('canvas')
  output.width = Math.max(16, Math.ceil(cropWidth * scale))
  output.height = Math.max(16, Math.ceil(cropHeight * scale))
  const context = output.getContext('2d')!
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(element, left, top, strokeWidth, strokeHeight,
    padding * scale, padding * scale, strokeWidth * scale, strokeHeight * scale)
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
  <div class="mx-auto w-full min-w-0 max-w-4xl">
    <header class="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-base font-semibold text-ink sm:text-lg">{{ t('Buat tanda tangan') }}</h3>
        <p class="mt-1 text-sm text-muted">{{ t('Gambar tanda tangan menggunakan mouse atau sentuhan.') }}</p>
      </div>
      <span class="rounded-full bg-soft px-3 py-1 text-xs font-medium text-primary">{{ t('Coretan langsung') }}</span>
    </header>
    <div class="overflow-hidden rounded-xl border border-line bg-white">
      <canvas
        ref="canvas"
        width="800"
        height="280"
        class="block h-60 w-full touch-none bg-white sm:h-[280px]"
        :aria-label="t('Area menggambar tanda tangan')"
      ></canvas>
      <p class="border-t border-line bg-soft/50 px-4 py-2 text-center text-xs text-muted">{{ t('Area tanda tangan') }}</p>
    </div>
    <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <button
        type="button"
        class="inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-lg border border-line px-4 text-sm font-medium text-muted transition-colors hover:bg-soft hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 sm:self-auto"
        :disabled="!ink || disabled || verifying"
        @click="clear"
      >
        <span class="material-symbols-outlined text-[20px]" aria-hidden="true">restart_alt</span>
        {{ t('Hapus coretan') }}
      </button>
      <BaseButton class="w-full sm:w-auto" :loading="verifying" :disabled="!ink || disabled || verifying" @click="use">
        <span v-if="!verifying" class="material-symbols-outlined text-[20px]" aria-hidden="true">check</span>
        {{ t(verifying ? 'Memverifikasi tanda tangan...' : 'Gunakan tanda tangan') }}
      </BaseButton>
    </div>
    <p v-if="error" role="alert" class="mt-3 text-xs text-error">{{ t(error) }}</p>
  </div>
</template>

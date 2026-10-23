<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import Cropper from 'cropperjs'
import 'cropperjs/dist/cropper.css'
import { exportProfilePhoto } from '../../utils/profilePhoto'
import { t } from '../../services/workspace-language'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import BaseButton from '../ui/BaseButton.vue'

const props = defineProps<{ src: string; busy: boolean; error: string }>()
const emit = defineEmits<{ close: []; save: [file: File] }>()
const dialog = ref<HTMLDialogElement>()
const image = ref<HTMLImageElement>()
const preview = ref<HTMLElement>()
const ready = ref(false)
const exporting = ref(false)
const localError = ref('')
const zoom = ref(1)
let minimumZoom = 1
let cropper: Cropper | undefined
let disposed = false

function close() {
  if (!props.busy && !exporting.value) emit('close')
}

function initialize() {
  if (!image.value || disposed) return
  cropper = new Cropper(image.value, {
    aspectRatio: 1, viewMode: 1, dragMode: 'move', autoCropArea: 0.8,
    cropBoxMovable: false, cropBoxResizable: false, toggleDragModeOnDblclick: false,
    guides: false, center: false, highlight: false, background: false,
    preview: preview.value,
    ready() {
      ready.value = true
      const canvas = cropper!.getCanvasData()
      const box = cropper!.getCropBoxData()
      minimumZoom = Math.max(box.width / canvas.naturalWidth, box.height / canvas.naturalHeight)
      zoom.value = canvas.width / canvas.naturalWidth / minimumZoom
    },
    zoom(event) {
      zoom.value = event.detail.ratio / minimumZoom
    },
  })
}

async function save() {
  if (!cropper || !ready.value || props.busy || exporting.value) return
  exporting.value = true
  localError.value = ''
  try {
    const file = await exportProfilePhoto(cropper)
    if (!disposed) emit('save', file)
  } catch {
    localError.value = t('Foto gagal diproses. Silakan coba lagi atau pilih gambar lain.')
  } finally {
    exporting.value = false
  }
}

onMounted(() => dialog.value?.showModal())
onUnmounted(() => {
  disposed = true
  cropper?.destroy()
  dialog.value?.close()
})
</script>

<template>
  <dialog ref="dialog" aria-labelledby="photo-crop-title" :aria-busy="busy || exporting" class="photo-crop-dialog fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-5 text-ink shadow-2xl" @cancel.prevent="close" @click="($event.target === dialog) && close()">
    <h2 id="photo-crop-title" class="text-xl font-semibold">{{ t('Sesuaikan foto profil') }}</h2>
    <p class="my-3 text-sm text-muted">{{ t('Geser foto dan atur zoom untuk menyesuaikan avatar.') }}</p>
    <fieldset :disabled="busy || exporting" class="min-w-0" :class="{ 'pointer-events-none': busy || exporting }">
      <div class="crop-stage h-[min(55dvh,22rem)] overflow-hidden rounded-xl bg-ink" role="img" :aria-label="t('Area potong foto profil')">
        <img ref="image" :src="src" alt="" class="block max-w-full" @load="initialize" @error="localError = t('Berkas bukan gambar yang dapat dibaca.')" />
      </div>
      <div class="my-4 flex items-center gap-4">
        <div ref="preview" class="size-16 shrink-0 overflow-hidden rounded-full bg-sage" role="img" :aria-label="t('Pratinjau foto profil')"></div>
        <label class="flex-1 text-sm font-semibold">{{ t('Zoom foto') }}
          <input v-model.number="zoom" type="range" min="1" :max="Math.max(4, zoom)" step="0.01" class="mt-2 block min-h-8 w-full accent-primary" :disabled="!ready" @input="cropper?.zoomTo(zoom * minimumZoom)" />
        </label>
      </div>
    </fieldset>
    <FeedbackMessage :message="localError || error" error />
    <div class="flex justify-end gap-3">
      <button type="button" autofocus class="min-h-12 rounded-lg border border-line px-4 text-sm disabled:opacity-50" :disabled="busy || exporting" @click="close">{{ t('Batal') }}</button>
      <BaseButton :loading="busy || exporting" :disabled="!ready || busy || exporting" @click="save">{{ busy || exporting ? t('Menyimpan…') : t('Simpan foto') }}</BaseButton>
    </div>
  </dialog>
</template>

<style scoped>
.photo-crop-dialog::backdrop { background: rgb(23 61 53 / 45%); }
.crop-stage :deep(.cropper-view-box) { border-radius: 50%; outline: 0; box-shadow: 0 0 0 100vmax rgb(0 0 0 / 65%); }
.crop-stage :deep(.cropper-face) { background: transparent; }
.crop-stage :deep(.cropper-modal) { opacity: 0; }
.crop-stage :deep(.cropper-line), .crop-stage :deep(.cropper-point) { display: none; }
</style>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { documentsApi } from '../../services/documents.service'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import type { Page, SignatureAsset } from '../../types/documents'
import SignatureCanvas from './SignatureCanvas.vue'
import AssetImage from './AssetImage.vue'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
const props = defineProps<{ selectable?: boolean; selected?: string; disabled?: boolean }>()
const emit = defineEmits<{ select: [asset: SignatureAsset] }>()
const page = ref<Page<SignatureAsset>>(),
  mode = ref('saved'),
  file = ref<File>(),
  preview = ref(''),
  source = ref<'drawn' | 'upload'>('upload'),
  message = ref('')
const { busy, error, fields, run } = useWorkspaceRequest()
let active = true,
  selection = 0
async function load(number = 1) {
  const result = await run(() => documentsApi.assets(number))
  if (result) page.value = result
}
async function choose(value: File, type: 'drawn' | 'upload') {
  const serial = ++selection
  error.value = ''
  message.value = ''
  file.value = undefined
  if (preview.value) URL.revokeObjectURL(preview.value)
  preview.value = ''
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(value.type) ||
    !/\.(png|jpe?g|webp)$/i.test(value.name) ||
    value.size > 2048 * 1024
  ) {
    error.value = 'Gunakan PNG/JPEG/WebP maksimal 2.048 KB.'
    return
  }
  const url = URL.createObjectURL(value),
    image = new Image()
  image.src = url
  try {
    await image.decode()
    if (!active || serial !== selection) {
      URL.revokeObjectURL(url)
      return
    }
    if (image.width < 16 || image.height < 16 || image.width > 2048 || image.height > 1024)
      throw new Error('dimensions')
    file.value = value
    source.value = type
    preview.value = url
  } catch {
    URL.revokeObjectURL(url)
    error.value = 'Dimensi gambar harus 16×16 sampai 2.048×1.024 piksel.'
  }
}
function uploadInput(event: Event) {
  const input = event.target as HTMLInputElement
  const value = input.files?.[0]
  input.value = ''
  if (value) void choose(value, 'upload')
}
async function upload() {
  if (!file.value || props.disabled) return
  const result = await run(() => documentsApi.uploadAsset(file.value!, source.value))
  if (result) {
    file.value = undefined
    URL.revokeObjectURL(preview.value)
    preview.value = ''
    message.value = 'Aset tanda tangan tersimpan.'
    mode.value = 'saved'
    await load()
    if (props.selectable) emit('select', result)
  }
}
onMounted(() => load())
onUnmounted(() => {
  active = false
  selection++
  if (preview.value) URL.revokeObjectURL(preview.value)
})
</script>
<template>
  <section class="min-w-0">
    <div class="mb-5 flex flex-wrap gap-2" role="group" aria-label="Sumber tanda tangan">
      <button
        v-for="item in [
          { id: 'saved', label: 'Aset tersimpan' },
          { id: 'drawn', label: 'Coretan langsung' },
          { id: 'upload', label: 'Unggah gambar' },
        ]"
        :key="item.id"
        class="min-h-11 rounded-full border border-line px-4 text-xs disabled:opacity-40"
        :class="mode === item.id ? 'bg-primary text-white' : 'bg-white text-primary'"
        :disabled="busy || disabled"
        :aria-pressed="mode === item.id"
        @click="mode = item.id"
      >
        {{ item.label }}
      </button>
    </div>
    <FeedbackMessage :message="error" error /><FeedbackMessage :message="message" />
    <p v-for="(text, key) in fields" :key="key" class="mb-2 text-xs text-error">{{ text }}</p>
    <fieldset :disabled="busy || disabled">
      <div v-if="mode === 'saved'">
        <p v-if="busy" role="status" class="text-sm text-muted">Memuat aset…</p>
        <button v-if="error" class="min-h-11 text-sm text-primary underline" @click="load()">
          Coba lagi
        </button>
        <p v-if="page && !page.data.length" class="py-8 text-sm text-muted">
          Belum ada tanda tangan tersimpan. Buat coretan atau unggah gambar pertama Anda.
        </p>
        <div class="grid gap-3 sm:grid-cols-2">
          <component
            :is="selectable ? 'button' : 'div'"
            v-for="asset in page?.data"
            :key="asset.guid"
            :type="selectable ? 'button' : undefined"
            class="min-w-0 rounded-xl border bg-white p-4 text-left"
            :class="selected === asset.guid ? 'border-primary ring-2 ring-sage' : 'border-line'"
            :aria-pressed="selectable ? selected === asset.guid : undefined"
            @click="selectable && emit('select', asset)"
            ><AssetImage :guid="asset.guid" /><span class="mt-3 block text-xs text-muted"
              >{{ asset.source_type === 'drawn' ? 'Coretan' : 'Unggahan' }} · {{ asset.width }}×{{
                asset.height
              }}
              px</span
            ></component
          >
        </div>
        <nav
          v-if="page && page.meta.last_page > 1"
          class="mt-4 flex flex-wrap items-center gap-4 text-xs"
          aria-label="Halaman aset"
        >
          <button
            class="min-h-11 text-primary disabled:opacity-40"
            :disabled="!page.links.prev"
            @click="load(page.meta.current_page - 1)"
          >
            ← Sebelumnya</button
          ><span>{{ page.meta.current_page }} / {{ page.meta.last_page }}</span
          ><button
            class="min-h-11 text-primary disabled:opacity-40"
            :disabled="!page.links.next"
            @click="load(page.meta.current_page + 1)"
          >
            Berikutnya →
          </button>
        </nav>
      </div>
      <SignatureCanvas v-if="mode === 'drawn'" @created="choose($event, 'drawn')" />
      <div
        v-if="mode === 'upload'"
        class="rounded-xl border border-dashed border-line bg-white p-5"
      >
        <label class="grid gap-3 text-sm"
          >Pilih gambar tanda tangan<input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="min-h-11 w-full min-w-0 text-xs"
            @change="uploadInput"
        /></label>
        <p class="mt-3 text-xs text-muted">
          PNG/JPEG/WebP · Maks. 2.048 KB · 16×16 sampai 2.048×1.024 px
        </p>
      </div>
      <div v-if="file" class="mt-5 rounded-xl border border-line bg-white p-4">
        <p class="mb-3 text-xs font-semibold">Preview aset baru</p>
        <img :src="preview" alt="Preview aset baru" class="h-28 w-full object-contain" /><BaseButton
          class="mt-4"
          :loading="busy"
          @click="upload"
          >Simpan aset</BaseButton
        >
      </div>
    </fieldset>
  </section>
</template>

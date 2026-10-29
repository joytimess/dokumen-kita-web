<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { documentsApi } from '../../services/documents.service'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import type { Page, SignatureAsset } from '../../types/documents'
import { nextSignatureTabIndex } from '../../utils/signatureTabs'
import SignatureCanvas from './SignatureCanvas.vue'
import AssetImage from './AssetImage.vue'
import SignatureAssetPreview from './SignatureAssetPreview.vue'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import { confirmAction, notify } from '../../services/feedback'
import { formatNumber, t } from '../../services/workspace-language'
const props = defineProps<{
  selectable?: boolean
  selected?: string
  disabled?: boolean
  standalone?: boolean
}>()
const emit = defineEmits<{ select: [asset: SignatureAsset] }>()
const methods = [
  { id: 'saved', label: 'Aset tersimpan' },
  { id: 'drawn', label: 'Coretan langsung' },
  { id: 'upload', label: 'Unggah gambar' },
] as const
type Method = (typeof methods)[number]['id']
const page = ref<Page<SignatureAsset>>(),
  mode = ref<Method>('saved'),
  previewAsset = ref<SignatureAsset>(),
  file = ref<File>(),
  preview = ref(''),
  source = ref<'drawn' | 'upload'>('upload'),
  message = ref(''),
  submitting = ref(false)
const { busy, error, fields, run } = useWorkspaceRequest()
const tabs: HTMLButtonElement[] = []
let active = true,
  selection = 0,
  confirming = false
let submission: AbortController | undefined
function setTab(element: unknown, index: number) {
  if (element instanceof HTMLButtonElement) tabs[index] = element
}
function selectMethod(method: Method) {
  mode.value = method
  tabs[methods.findIndex((item) => item.id === method)]?.focus()
}
function onTabKeydown(event: KeyboardEvent, index: number) {
  const nextIndex = nextSignatureTabIndex(event.key, index, methods.length)
  if (nextIndex === index) return
  event.preventDefault()
  selectMethod(methods[nextIndex]!.id)
}
async function load(number = 1): Promise<boolean> {
  const result = await run(() => documentsApi.assets(number, props.standalone ? 6 : 15))
  if (!result) return false
  page.value = result
  return true
}
async function removeAsset(asset: SignatureAsset) {
  if (!props.standalone || busy.value || props.disabled) return
  if (
    !(await confirmAction(t('Hapus tanda tangan ini dari aset tersimpan? Tindakan ini tidak dapat dibatalkan.'), {
      title: t('Hapus tanda tangan'),
      action: t('Ya, Hapus'),
      danger: true,
    })) ||
    !active
  )
    return

  const deleted = await run(async () => {
    await documentsApi.deleteAsset(asset.guid)
    return true
  })
  if (!deleted) return

  const current = page.value
  const total = Math.max(0, (current?.meta.total ?? 1) - 1)
  const lastPage = Math.max(1, Math.ceil(total / (current?.meta.per_page ?? 15)))
  const currentPage = Math.min(current?.meta.current_page ?? 1, lastPage)
  if (current) {
    page.value = {
      ...current,
      data:
        currentPage === current.meta.current_page
          ? current.data.filter((item) => item.guid !== asset.guid)
          : [],
      meta: { ...current.meta, current_page: currentPage, last_page: lastPage, total },
      links: {
        prev: currentPage > 1 ? current.links.prev : null,
        next: currentPage < lastPage ? current.links.next : null,
      },
    }
  }
  message.value = 'Tanda tangan berhasil dihapus.'
  notify.success(message.value)
  await load(currentPage)
}
async function choose(value: File, type: 'drawn' | 'upload') {
  if (!active || busy.value || submitting.value || props.disabled) return
  const serial = ++selection
  error.value = ''
  fields.value = {}
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
    if (!active || serial !== selection) return
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
  if (!active || !file.value || busy.value || submitting.value || confirming || props.disabled) return
  confirming = true
  let confirmed: boolean
  try {
    confirmed = await confirmAction('Simpan gambar ini sebagai aset tanda tangan?', {
      title: t('Simpan tanda tangan'),
      action: t('Simpan'),
    })
  } finally {
    confirming = false
  }
  if (!confirmed || !active || props.disabled || busy.value || !file.value) return
  const selectedFile = file.value,
    selectedSource = source.value
  submitting.value = true
  message.value = ''
  const request = new AbortController()
  submission = request
  try {
    const result = await run(() => documentsApi.uploadAsset(selectedFile, selectedSource, request.signal))
    if (!result || !active) return
    file.value = undefined
    URL.revokeObjectURL(preview.value)
    preview.value = ''
    message.value = 'Aset tanda tangan tersimpan.'
    notify.success(message.value)
    selectMethod('saved')
    await load()
    if (active && props.selectable) emit('select', result)
  } finally {
    if (active) submitting.value = false
  }
}
onMounted(() => load())
onUnmounted(() => {
  active = false
  submission?.abort()
  selection++
  if (preview.value) URL.revokeObjectURL(preview.value)
})
</script>
<template>
  <section
    class="min-w-0"
    :class="standalone ? 'rounded-2xl border border-line bg-white p-4 sm:p-6' : ''"
  >
    <header v-if="standalone" class="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-xl font-semibold">{{ t('Aset Tanda Tangan') }}</h2>
        <p v-if="page" class="mt-1 text-sm text-muted">
          {{ t(':count aset tersimpan', { count: formatNumber(page.meta.total) }) }}
        </p>
      </div>
    </header>
    <div class="mb-5 border-b border-line pb-4">
      <div class="flex w-full gap-2" role="tablist" :aria-label="t('Sumber tanda tangan')">
        <button
          v-for="(item, index) in methods"
          :key="item.id"
          :id="`signature-tab-${item.id}`"
          :ref="(element) => setTab(element, index)"
          role="tab"
          :aria-controls="`signature-panel-${item.id}`"
          :aria-selected="mode === item.id"
          :tabindex="mode === item.id ? 0 : -1"
          class="min-h-11 w-1/3 min-w-0 rounded-lg border px-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
          :class="
            mode === item.id
              ? 'border-primary bg-primary text-white'
              : 'border-line bg-white text-muted hover:bg-soft'
          "
          :disabled="busy || submitting || disabled"
          @click="mode = item.id"
          @keydown="onTabKeydown($event, index)"
        >
          {{ t(item.label) }}
        </button>
      </div>
    </div>
    <FeedbackMessage :message="t(error)" error /><FeedbackMessage :message="t(message)" />
    <p v-for="(text, key) in fields" :key="key" class="mb-2 text-xs text-error">{{ text }}</p>
    <fieldset class="min-w-0 border-0 p-0" :disabled="busy || submitting || disabled">
      <div
        id="signature-panel-saved"
        v-show="mode === 'saved'"
        role="tabpanel"
        aria-labelledby="signature-tab-saved"
        tabindex="0"
        class="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div
          v-if="busy && !page"
          role="status"
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div
            v-for="item in 3"
            :key="item"
            class="animate-pulse rounded-xl border border-line p-4 motion-reduce:animate-none"
          >
            <div class="h-36 rounded-lg bg-soft"></div>
            <div class="mt-4 h-4 w-2/3 rounded bg-soft"></div>
            <div class="mt-2 h-3 w-1/2 rounded bg-soft"></div>
          </div>
          <span class="sr-only">{{ t('Memuat aset…') }}</span>
        </div>
        <button
          v-if="error"
          type="button"
          class="mt-3 min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :disabled="busy || disabled"
          @click="load()"
        >
          {{ t('Coba lagi') }}
        </button>
        <div
          v-if="page && !page.meta.total"
          class="rounded-xl border border-dashed border-line bg-soft/50 px-5 py-10 text-center sm:py-12"
        >
          <span class="material-symbols-outlined text-4xl text-primary" aria-hidden="true"
            >draw</span
          >
          <h3 class="mt-3 text-lg font-semibold">{{ t('Belum ada tanda tangan tersimpan.') }}</h3>
          <p class="mx-auto mt-2 max-w-md text-sm text-muted">
            {{ t('Buat coretan atau unggah gambar pertama Anda.') }}
          </p>
          <div class="mt-5 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              class="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              @click="selectMethod('drawn')"
            >
              {{ t('Buat coretan') }}
            </button>
            <button
              type="button"
              class="min-h-11 rounded-lg border border-primary bg-white px-4 text-sm font-semibold text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              @click="selectMethod('upload')"
            >
              {{ t('Unggah gambar') }}
            </button>
          </div>
        </div>
        <p
          v-else-if="page && !page.data.length"
          class="rounded-xl border border-dashed border-line bg-soft/50 px-5 py-8 text-center text-sm text-muted"
        >
          {{ t('Tidak ada aset di halaman ini.') }}
        </p>
        <div
          v-else-if="page?.data.length"
          class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <component
            :is="selectable ? 'button' : 'article'"
            v-for="asset in page?.data"
            :key="asset.guid"
            :type="selectable ? 'button' : undefined"
            class="relative flex min-h-56 min-w-0 w-full flex-col rounded-xl border bg-white p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            :class="selected === asset.guid ? 'border-primary ring-2 ring-sage' : 'border-line'"
            :aria-pressed="selectable ? selected === asset.guid : undefined"
            @click="selectable && emit('select', asset)"
          >
            <button
              v-if="standalone"
              type="button"
              class="mb-4 flex h-36 w-full items-center justify-center overflow-hidden rounded-lg bg-soft px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :aria-label="t('Pratinjau tanda tangan')"
              :title="t('Pratinjau tanda tangan')"
              @click.stop="previewAsset = asset"
            >
              <AssetImage :guid="asset.guid" image-class="h-full w-full object-contain" />
            </button>
            <span
              v-else
              class="flex h-36 w-full items-center justify-center overflow-hidden rounded-lg bg-soft px-3"
            ><AssetImage :guid="asset.guid" /></span>
            <button
              v-if="standalone"
              type="button"
              class="absolute right-3 top-3 flex size-9 items-center justify-center rounded-lg border border-line bg-white text-muted transition-colors hover:border-error hover:bg-error/10 hover:text-error focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
              :aria-label="t('Hapus tanda tangan')"
              :title="t('Hapus tanda tangan')"
              :disabled="busy || disabled"
              @click.stop="removeAsset(asset)"
            >
              <span class="material-symbols-outlined" aria-hidden="true">delete</span>
            </button>
            <span class="block text-sm font-semibold text-ink">
              {{ t(asset.source_type === 'drawn' ? 'Coretan' : 'Unggahan') }}
            </span>
            <span class="mt-1 block text-xs text-muted">
              {{ formatNumber(asset.width) }}×{{ formatNumber(asset.height) }} px
            </span>
            <span v-if="selectable" class="mt-auto block pt-3 text-xs font-semibold text-primary">
              {{ t(selected === asset.guid ? 'Tanda tangan dipilih' : 'Pilih tanda tangan ini') }}
            </span>
          </component>
        </div>
        <nav
          v-if="page && page.meta.total > 0"
          class="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm"
          :aria-label="t('Halaman aset')"
        >
          <span class="text-xs text-muted">
            {{
              t('Menampilkan :start–:end dari :total', {
                start: formatNumber((page.meta.current_page - 1) * page.meta.per_page + 1),
                end: formatNumber(Math.min(page.meta.current_page * page.meta.per_page, page.meta.total)),
                total: formatNumber(page.meta.total),
              })
            }}
          </span>
          <div class="ml-auto flex items-center gap-2">
          <button
            type="button"
            class="grid size-9 place-items-center rounded-md border border-line bg-white text-ink hover:bg-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:text-muted disabled:opacity-50"
            :aria-label="t('Sebelumnya')"
            :disabled="!page.links.prev || busy || disabled"
            @click="load(page.meta.current_page - 1)"
          >
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">chevron_left</span>
          </button>
          <button
            type="button"
            class="grid size-9 place-items-center rounded-md border border-line bg-white text-ink hover:bg-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:text-muted disabled:opacity-50"
            :aria-label="t('Berikutnya')"
            :disabled="!page.links.next || busy || disabled"
            @click="load(page.meta.current_page + 1)"
          >
            <span class="material-symbols-outlined text-[20px]" aria-hidden="true">chevron_right</span>
          </button>
          </div>
        </nav>
      </div>
      <div
        id="signature-panel-drawn"
        v-show="mode === 'drawn'"
        role="tabpanel"
        aria-labelledby="signature-tab-drawn"
        tabindex="0"
        class="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <SignatureCanvas :active="mode === 'drawn'" :disabled="busy || submitting || disabled" :verifying="submitting && source === 'drawn'" @created="choose($event, 'drawn')" />
      </div>
      <div
        id="signature-panel-upload"
        v-show="mode === 'upload'"
        role="tabpanel"
        aria-labelledby="signature-tab-upload"
        tabindex="0"
        class="min-w-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <label
          class="flex min-h-44 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-soft/50 p-5 text-center text-sm transition-colors hover:border-primary/60 hover:bg-soft focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary"
        >
          <span class="material-symbols-outlined text-3xl text-primary" aria-hidden="true"
            >upload_file</span
          >
          <span class="font-semibold">{{ t('Pilih gambar tanda tangan') }}</span>
          <span class="text-xs text-muted">
            {{ t('PNG/JPEG/WebP · Maks. 2.048 KB · 16×16 sampai 2.048×1.024 px') }}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            class="sr-only"
            @change="uploadInput"
          />
        </label>
      </div>
      <div
        v-if="file"
        v-show="mode === source"
        class="mt-5 rounded-xl border border-line bg-soft/50 p-4"
      >
        <p class="mb-3 text-sm font-semibold">{{ t('Preview aset baru') }}</p>
        <img
          :src="preview"
          :alt="t('Preview aset baru')"
          class="h-32 w-full object-contain"
        /><BaseButton class="mt-4" :loading="busy || submitting" @click="upload">{{
          t(submitting ? 'Memverifikasi tanda tangan...' : 'Simpan aset')
        }}</BaseButton>
      </div>
    </fieldset>
    <SignatureAssetPreview
      v-if="previewAsset"
      :asset="previewAsset"
      @close="previewAsset = undefined"
    />
  </section>
</template>

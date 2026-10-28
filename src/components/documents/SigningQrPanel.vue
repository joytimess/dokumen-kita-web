<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { signingQrApi, type SigningQrMetadata } from '../../services/signing-qr.service'
import { workspaceError } from '../../services/workspace.errors'
import { qrStatusLabel } from '../../utils/signingQr'
import { t } from '../../services/workspace-language'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
const props = defineProps<{ versionGuid: string; versionStatus: string }>()
const metadata = ref<SigningQrMetadata>(), image = ref(''), busy = ref(false), error = ref(''), message = ref('')
let generation = 0
function clearImage() {
  if (image.value) URL.revokeObjectURL(image.value)
  image.value = ''
}
async function load() {
  const current = ++generation
  busy.value = true
  error.value = ''
  metadata.value = undefined
  clearImage()
  try {
    const result = await signingQrApi.metadata(props.versionGuid)
    const blob = await signingQrApi.image(props.versionGuid)
    if (current !== generation) return
    metadata.value = result
    image.value = URL.createObjectURL(blob)
  } catch (cause) {
    if (current === generation) error.value = workspaceError(cause).message
  } finally {
    if (current === generation) busy.value = false
  }
}
async function copy() {
  if (!metadata.value) return
  try { await navigator.clipboard.writeText(metadata.value.signing_url); message.value = 'Tautan signing berhasil disalin.' }
  catch { error.value = 'Tautan belum dapat disalin. Salin dari kolom tautan signing.' }
}
async function download() {
  if (busy.value) return
  busy.value = true
  try {
    const blob = await signingQrApi.image(props.versionGuid, true)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `signing-qr-${props.versionGuid}.svg`
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (cause) { error.value = workspaceError(cause).message }
  finally { busy.value = false }
}
watch(() => [props.versionGuid, props.versionStatus], () => void load(), { immediate: true })
onUnmounted(() => { generation++; clearImage() })
</script>
<template>
  <section class="qr-panel w-full min-w-0 rounded-xl border border-line bg-white p-4 md:p-8">
    <div class="flex items-start justify-between gap-3">
      <h2 class="min-w-0 text-xl font-semibold">QR Code Signing</h2>
      <span v-if="metadata?.status === 'active'" class="shrink-0 rounded-full bg-sage px-3 py-1 text-xs font-semibold text-primary">{{ t('Aktif') }}</span>
    </div>
    <p class="mt-1 text-sm text-muted">{{ t('Bagikan akses penandatanganan dokumen') }}</p>
    <FeedbackMessage :message="t(error)" error />
    <FeedbackMessage :message="t(message)" />
    <p v-if="busy" role="status" class="mt-4 text-sm">{{ t('Memuat QR…') }}</p>
    <template v-if="metadata">
      <div class="qr-content mt-4">
        <div class="flex min-w-0 items-center justify-center rounded-lg bg-soft p-4">
          <img v-if="image" :src="image" alt="QR Code Signing" width="320" height="320" class="h-auto w-40 max-w-full bg-white p-2" />
        </div>
        <div class="min-w-0">
          <h3 v-if="metadata.status === 'active'" class="text-sm font-semibold">{{ t('Siap digunakan') }}</h3>
          <p class="mt-1 text-sm leading-relaxed text-muted">{{ t('Satu QR untuk seluruh penandatangan dalam versi ini. Login diperlukan untuk melanjutkan.') }}</p>
          <p class="mt-1 text-sm text-muted">{{ t('Masuk dengan email penerima yang terverifikasi.') }}</p>
          <p class="mt-2 text-sm" role="status">{{ t(qrStatusLabel(metadata.status)) }}</p>
          <div class="mt-4 grid gap-2">
            <BaseButton class="w-full" :disabled="busy" @click="copy">{{ t('Salin tautan') }}</BaseButton>
            <button type="button" class="min-h-12 w-full rounded-[7px] border border-primary px-4 py-3 text-sm font-semibold text-primary hover:bg-soft disabled:cursor-wait disabled:opacity-65" :disabled="busy" @click="download">{{ t('Unduh QR SVG') }}</button>
          </div>
        </div>
      </div>
      <label class="mt-4 block min-w-0 text-sm">{{ t('Tautan signing') }}
        <input :value="metadata.signing_url" readonly class="mt-2 w-full min-w-0 overflow-hidden text-ellipsis rounded-lg border border-line bg-soft p-3 text-sm" @focus="($event.target as HTMLInputElement).select()" />
      </label>
    </template>
    <BaseButton v-else-if="error" class="mt-4" :loading="busy" @click="load">{{ t('Coba lagi') }}</BaseButton>
  </section>
</template>

<style scoped>
.qr-panel { container-type: inline-size; }
.qr-content { display: grid; gap: 1rem; }
@container (min-width: 440px) {
  .qr-content { grid-template-columns: minmax(0, 192px) minmax(0, 1fr); align-items: start; }
}
</style>

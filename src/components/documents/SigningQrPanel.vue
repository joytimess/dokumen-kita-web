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
  <section class="mt-6 rounded-xl border border-line bg-white p-5 sm:p-8">
    <h2 class="text-xl font-semibold">QR Code Signing</h2>
    <p class="mt-2 text-sm text-muted">{{ t('Satu QR untuk seluruh penandatangan yang ditentukan pada versi ini. Masuk dengan email penerima yang terverifikasi.') }}</p>
    <FeedbackMessage :message="t(error)" error />
    <FeedbackMessage :message="t(message)" />
    <p v-if="busy" role="status" class="mt-4 text-sm">{{ t('Memuat QR…') }}</p>
    <template v-if="metadata">
      <p class="mt-4 text-sm" role="status">{{ t(qrStatusLabel(metadata.status)) }}</p>
      <img v-if="image" :src="image" alt="QR Code Signing" width="320" height="320" class="mt-4 max-w-full" />
      <label class="mt-4 block text-sm">{{ t('Tautan signing') }}
        <input :value="metadata.signing_url" readonly class="mt-2 w-full rounded-lg border border-line bg-soft p-3 text-sm" @focus="($event.target as HTMLInputElement).select()" />
      </label>
      <div class="mt-4 flex flex-wrap gap-3">
        <BaseButton :disabled="busy" @click="copy">{{ t('Salin tautan signing') }}</BaseButton>
        <BaseButton :disabled="busy" @click="download">{{ t('Download QR SVG') }}</BaseButton>
      </div>
    </template>
    <BaseButton v-else-if="error" class="mt-4" :loading="busy" @click="load">{{ t('Coba lagi') }}</BaseButton>
  </section>
</template>

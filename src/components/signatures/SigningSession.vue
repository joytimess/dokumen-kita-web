<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import { createSignatureAction } from '../../composables/useSignatureAction'
import type { Assignment, Placeholder, RevisionResult, SignatureAsset } from '../../types/documents'
import PdfViewer from '../documents/PdfViewer.vue'
import AssetLibrary from './AssetLibrary.vue'
import SigningStepper from './SigningStepper.vue'
import SigningDecisionDialog from './SigningDecisionDialog.vue'
import SigningSuccess from './SigningSuccess.vue'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import { confirmAction, notify } from '../../services/feedback'
import { formatNumber, t } from '../../services/workspace-language'
import { statusLabel } from '../../utils/documents'
const props = defineProps<{
  versionGuid: string
  title: string
  versionNumber?: number
  assignment?: Assignment
  expectedHash?: string | null
  owner?: boolean
  status: string
  isCurrent?: boolean
  refresh: () => Promise<boolean>
}>()
const emit = defineEmits<{ signed: [] }>()
const auth = useAuthStore(),
  identity = auth.user!.guid
const hash = ref(''),
  eligible = ref(false),
  confirmed = ref(false),
  readBusy = ref(false),
  readConfirmed = ref(false),
  error = ref(''),
  message = ref(''),
  blockedUntil = ref(0),
  clock = ref(Date.now())
const step = ref<'reading' | 'signing' | 'success'>('reading')
const pageCount = ref(0), visitedPages = ref<number[]>([])
const readPercent = computed(() => eligible.value ? 100 : pageCount.value ? Math.min(99, Math.floor(visitedPages.value.length / pageCount.value * 100)) : 0)
const decision = ref<'revision' | 'rejection'>()
const confirming = ref(false)
const revisionReason = ref(''),
  revisionBusy = ref(false),
  revisionResult = ref<RevisionResult>()
const rejectionReason = ref(''),
  rejectionBusy = ref(false),
  rejectionResult = ref(false)
const selected = ref<SignatureAsset>(),
  assetUrl = ref(''),
  assetOptions = ref<HTMLElement>()
const action = createSignatureAction((payload) =>
  documentsApi.sign(props.assignment!.guid, payload),
)
const { pending, busy, completed, blocked } = action
let controller: AbortController | undefined,
  active = true
const timer = setInterval(() => {
  clock.value = Date.now()
}, 1000)
const remaining = computed(() => Math.max(0, Math.ceil((blockedUntil.value - clock.value) / 1000)))
const canRequestRevision = computed(
  () =>
    props.assignment?.status === 'ready' &&
    !!props.assignment.claimed_at &&
    auth.user?.email_verified &&
    auth.user.guid === identity &&
    props.isCurrent !== false &&
    props.status === 'in_progress',
)
const overlays = computed<(Placeholder & { label: string; image?: string })[]>(() =>
  (props.assignment?.placeholders ?? []).map((p) => ({
    ...p,
    label: props.assignment!.recipient_email,
    image: assetUrl.value || undefined,
  })),
)
watch(() => props.assignment?.status, (status) => {
  if (status === 'signed' && auth.user?.guid === identity) {
    step.value = 'success'
    emit('signed')
  }
}, { immediate: true })
async function continueToSigning() {
  if (!eligible.value || !confirmed.value || !hash.value || !canRequestRevision.value || blocked.value) return
  step.value = 'signing'
  await nextTick()
  assetOptions.value?.focus({ preventScroll: true })
}
watch(
  [
    () => props.versionGuid,
    () => props.expectedHash,
    () => props.assignment?.guid,
    () => props.assignment?.status,
  ],
  () => {
    eligible.value = false
    confirmed.value = false
    readConfirmed.value = false
    hash.value = ''
    if (pending.value) blocked.value = true
  },
)
watch(
  () => auth.user?.guid,
  (value) => {
    if (value !== identity) {
      action.dispose()
      selected.value = undefined
      revoke()
    }
  },
)
function revoke() {
  controller?.abort()
  if (assetUrl.value) URL.revokeObjectURL(assetUrl.value)
  assetUrl.value = ''
}
async function select(asset: SignatureAsset) {
  if (pending.value || busy.value || readBusy.value) return
  selected.value = asset
  revoke()
  const request = new AbortController()
  controller = request
  try {
    const file = await documentsApi.assetImage(asset.guid, request.signal)
    if (active && !request.signal.aborted) assetUrl.value = URL.createObjectURL(file)
  } catch {
    if (active && !request.signal.aborted)
      error.value = 'Gambar aset belum dapat dimuat. Pilih ulang untuk mencoba lagi.'
  }
}
function ready(actual: string) {
  hash.value = /^[a-f0-9]{64}$/.test(actual) ? actual : ''
  confirmed.value = false
  readConfirmed.value = false
}
function gate(value: boolean) {
  eligible.value = value
  if (!value) confirmed.value = false
}
function pdfFailure() {
  eligible.value = false
  confirmed.value = false
  readConfirmed.value = false
}
async function submit() {
  if (
    !selected.value ||
    !assetUrl.value ||
    !canRequestRevision.value ||
    !eligible.value ||
    !confirmed.value ||
    !hash.value ||
    busy.value ||
    readBusy.value ||
    confirming.value ||
    blocked.value ||
    remaining.value
  )
    return
  confirming.value = true
  try {
    if (!(await confirmAction('Tandatangani dokumen dengan aset yang dipilih?', {
      title: 'Konfirmasi tanda tangan', action: 'Tandatangani',
    }))) return
    error.value = ''
    readBusy.value = true
    if (!(await props.refresh())) {
      error.value = 'Status versi terbaru belum dapat diperiksa. Coba lagi.'
      return
    }
    await nextTick()
    if (props.assignment?.status === 'signed') return
    if (
      !active ||
      !selected.value ||
      !assetUrl.value ||
      !canRequestRevision.value ||
      !hash.value ||
      !eligible.value ||
      !confirmed.value ||
      blocked.value ||
      remaining.value
    )
      return
    if (!readConfirmed.value) {
      await documentsApi.read(props.assignment!.guid, hash.value)
      if (!active) return
      readConfirmed.value = true
    }
    await action.sign(selected.value.guid, hash.value)
    if (!active || !completed.value || auth.user?.guid !== identity) return
    selected.value = undefined
    revoke()
    step.value = 'success'
    emit('signed')
  } catch (cause) {
    if (!active) return
    const feedback = workspaceError(cause)
    error.value = feedback.message
    if (feedback.retryAt) blockedUntil.value = feedback.retryAt
    if ([403, 404, 409, 419, 422].includes(feedback.status ?? 0)) {
      blocked.value = true
      confirmed.value = false
      await props.refresh?.()
    }
    if (feedback.status === 401) {
      action.dispose()
      auth.user = null
    }
  } finally {
    readBusy.value = false
    confirming.value = false
  }
}
async function requestRevision() {
  const reason = revisionReason.value.trim()
  if (
    !canRequestRevision.value ||
    reason.length < 3 ||
    reason.length > 1000 ||
    revisionBusy.value ||
    busy.value ||
    readBusy.value ||
    pending.value
  )
    return
  if (!(await confirmAction(
    'Versi ini akan dihentikan. Semua penerima harus membaca dan menandatangani ulang draft baru. Lanjutkan?',
    { title: 'Minta revisi', action: 'Minta revisi', danger: true },
  ))) return
  revisionBusy.value = true
  error.value = ''
  try {
    const result = await documentsApi.requestRevision(props.assignment!.guid, reason)
    decision.value = undefined
    revisionResult.value = result
    blocked.value = true
    message.value = 'Permintaan revisi diterima. Versi ini tidak aktif lagi.'
    notify.success(message.value)
    await props.refresh?.()
  } catch (cause) {
    const feedback = workspaceError(cause)
    error.value = feedback.message
    if (feedback.status === 401) auth.user = null
    else if ([403, 404, 409, 422].includes(feedback.status ?? 0)) await props.refresh?.()
  } finally {
    revisionBusy.value = false
  }
}
async function reject() {
  const reason = rejectionReason.value.trim()
  if (
    !canRequestRevision.value || reason.length < 3 || reason.length > 1000 ||
    rejectionBusy.value || revisionBusy.value || busy.value || readBusy.value || pending.value
  ) return
  if (!(await confirmAction(
    'Penolakan menghentikan versi ini dan membatalkan giliran signer berikutnya. Tidak ada draft revisi baru. Lanjutkan?',
    { title: 'Tolak dokumen', action: 'Tolak', danger: true },
  ))) return
  rejectionBusy.value = true
  error.value = ''
  try {
    await documentsApi.reject(props.assignment!.guid, reason)
    decision.value = undefined
    rejectionResult.value = true
    blocked.value = true
    message.value = 'Penolakan diterima. Versi ini dihentikan dan signer berikutnya tidak akan aktif.'
    notify.success(message.value)
    await props.refresh()
  } catch (cause) {
    const feedback = workspaceError(cause)
    error.value = feedback.message
    if (feedback.status === 401) auth.user = null
    else if ([403, 404, 409, 422].includes(feedback.status ?? 0)) await props.refresh()
  } finally {
    rejectionBusy.value = false
  }
}
onUnmounted(() => {
  active = false
  clearInterval(timer)
  action.dispose()
  revoke()
})
</script>
<template>
  <div class="grid min-w-0 gap-5">
    <SigningStepper v-if="assignment" :step="step" class="sr-only" />
    <SigningSuccess v-if="step === 'success'" :title="title" />
    <template v-else>
      <FeedbackMessage :message="t(message)" /><FeedbackMessage :message="t(error)" error />
      <PdfViewer
        :version-guid="versionGuid"
        :expected-hash="expectedHash"
        :overlays="overlays"
        @ready="ready"
        @gate="gate"
        @progress="(count, visited) => { pageCount = count; visitedPages = visited }"
        @failure="pdfFailure"
      />
      <section v-if="assignment" class="rounded-xl border border-line bg-white p-5 sm:p-6">
        <div v-if="revisionResult" class="text-sm">
          <p>{{ t('Versi sebelumnya: :status. Draft penerus: :next.', {
            status: statusLabel(revisionResult.previous_status), next: statusLabel(revisionResult.draft_status),
          }) }}</p>
          <RouterLink v-if="assignment.document_guid" :to="`/documents/${assignment.document_guid}`" class="mt-2 inline-block text-primary underline">{{ t('Buka detail dokumen') }}</RouterLink>
        </div>
        <template v-else-if="canRequestRevision && !rejectionResult">
          <template v-if="step === 'reading'">
            <h2 class="font-semibold">{{ t('Konfirmasi baca') }}</h2>
            <div class="mt-4 rounded-lg border border-line bg-soft p-4 sm:p-5">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="text-xs font-semibold tracking-wide text-muted">{{ t('PROGRES PEMBACAAN') }}</p>
                  <p class="mt-1 text-sm text-muted">{{ t(':visited dari :total halaman telah dibaca', { visited: formatNumber(visitedPages.length), total: formatNumber(pageCount) }) }}</p>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-xl font-semibold tabular-nums text-primary">{{ readPercent }}%</span>
                  <span class="rounded-full px-3 py-1 text-xs font-semibold" :class="eligible ? 'bg-primary/10 text-primary' : 'bg-white text-muted'" role="status">{{ t(eligible ? 'Selesai dibaca' : 'Dalam proses') }}</span>
                </div>
              </div>
              <div class="mt-4 h-2 overflow-hidden rounded-full bg-line" role="progressbar" :aria-label="t('Progres pembacaan')" :aria-valuenow="readPercent" aria-valuemin="0" aria-valuemax="100"><div class="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" :style="{ width: `${readPercent}%` }"></div></div>
              <div v-if="pageCount" class="mt-3 flex flex-wrap gap-1.5" :aria-label="t('Status halaman')">
                <span v-for="page in pageCount" :key="page" class="grid size-8 place-items-center rounded text-xs font-medium" :class="visitedPages.includes(page) ? 'bg-primary/10 text-primary' : 'border border-line bg-white text-muted'" :aria-label="t(visitedPages.includes(page) ? 'Halaman :page sudah dibaca' : 'Halaman :page belum dibaca', { page: formatNumber(page) })">{{ formatNumber(page) }}</span>
              </div>
              <p class="mt-3 text-sm" :class="eligible ? 'font-medium text-primary' : 'text-muted'">{{ eligible ? t('Dokumen telah selesai dibaca.') : t('Kunjungi semua halaman yang berhasil dirender dan capai akhir dokumen. Pencarian atau lompat ke halaman terakhir saja tidak memenuhi syarat.') }}</p>
            </div>
            <p v-if="!hash" class="mt-2 text-sm text-error">{{ t('Hash versi resmi belum tersedia. Persetujuan diblokir.') }}</p>
            <label class="mt-4 flex items-start gap-3 rounded-lg border border-line bg-soft p-4 text-sm text-ink"><input v-model="confirmed" type="checkbox" class="mt-1 accent-primary" :disabled="!eligible || !hash || busy || readBusy || blocked" /><span>{{ t('Saya telah membaca dan memahami dokumen versi ini.') }}<span class="mt-1 block text-xs text-muted">{{ t('Pernyataan ini diperlukan sebelum masuk ke tahap tanda tangan.') }}</span></span></label>
            <BaseButton class="mt-5 w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:w-auto" :disabled="!eligible || !confirmed || !hash || blocked || busy || readBusy" @click="continueToSigning">{{ t('Lanjut tanda tangan') }} <span aria-hidden="true">→</span></BaseButton>
            <div class="mt-6 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div><h3 class="text-sm font-semibold">{{ t('Ada masalah dengan dokumen?') }}</h3><p class="mt-1 max-w-md text-sm text-muted">{{ t('Ajukan perbaikan jika ada yang perlu diubah, atau tolak jika Anda tidak dapat menyetujuinya.') }}</p></div>
              <div class="flex flex-wrap gap-2">
                <button type="button" class="min-h-11 rounded border border-amber-400 px-4 text-sm font-semibold text-amber-800 hover:bg-amber-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:opacity-40" :disabled="busy || readBusy || !!pending" @click="error = ''; decision = 'revision'"><span aria-hidden="true">✎</span> {{ t('Minta revisi') }}</button>
                <button type="button" class="min-h-11 rounded border border-red-300 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700 disabled:opacity-40" :disabled="busy || readBusy || !!pending" @click="error = ''; decision = 'rejection'"><span aria-hidden="true">×</span> {{ t('Tolak dokumen') }}</button>
              </div>
            </div>
          </template>
          <div v-else ref="assetOptions" role="region" :aria-label="t('Pilih cara tanda tangan')" tabindex="-1">
            <h2 class="font-semibold">{{ t('Tanda tangan') }}</h2>
            <p class="mt-1 text-sm text-muted">{{ title }}</p>
            <AssetLibrary class="mt-4" selectable :selected="selected?.guid" :disabled="!!pending || busy || readBusy || confirming" @select="select" />
            <div v-if="assetUrl" class="my-4 overflow-hidden rounded-lg border border-line bg-white">
              <div class="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <h3 class="text-xs font-semibold uppercase tracking-wide text-muted">{{ t('Preview tanda tangan') }}</h3>
                <span class="rounded bg-sage px-2 py-1 text-xs font-medium text-primary">{{ t('Siap digunakan') }}</span>
              </div>
              <div class="flex min-h-36 items-center justify-center p-4">
                <img :src="assetUrl" :alt="t('Tanda tangan pilihan Anda')" class="h-24 w-full object-contain" />
              </div>
              <div class="flex items-start gap-3 border-t border-line bg-soft p-4">
                <span class="material-symbols-outlined text-primary" aria-hidden="true">check_circle</span>
                <div>
                  <p class="text-sm font-semibold text-primary">{{ t(':count area tanda tangan ditemukan', { count: formatNumber(overlays.length) }) }}</p>
                  <p class="mt-1 text-xs text-muted">{{ t('Preview ini diterapkan ke :count area milik Anda.', { count: formatNumber(overlays.length) }) }}</p>
                </div>
              </div>
            </div>
            <p v-if="pending" class="my-3 text-xs text-muted">{{ t('Status akan diperiksa sebelum mengulang tindakan dengan aset, hash, dan kunci yang sama.') }}</p>
            <p v-if="remaining" class="my-3 text-xs text-muted">{{ t('Coba kembali dalam :seconds detik.', { seconds: formatNumber(remaining) }) }}</p>
            <div class="mt-4 flex items-center justify-between gap-3">
              <button type="button" class="min-h-11 text-sm text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40" :disabled="busy || readBusy || confirming || !!pending" @click="step = 'reading'"><span aria-hidden="true">←</span> {{ t('Kembali membaca') }}</button>
              <BaseButton :loading="busy || readBusy || confirming" :disabled="!selected || !assetUrl || !eligible || !confirmed || !hash || !canRequestRevision || blocked || remaining > 0 || confirming" @click="submit">{{ t(pending ? 'Coba persetujuan yang sama' : 'Tandatangani') }} <span aria-hidden="true">→</span></BaseButton>
            </div>
          </div>
        </template>
        <p v-else-if="!revisionResult && !rejectionResult" class="text-sm text-muted">{{ t('Tindakan belum tersedia: undangan harus diklaim, email diverifikasi, dan giliran aktif pada versi terbaru yang masih dalam proses.') }}</p>
      </section>
      <SigningDecisionDialog v-if="decision === 'revision'" v-model="revisionReason" :error="error" kind="revision" :open="decision === 'revision'" :busy="revisionBusy" :disabled="revisionReason.trim().length < 3 || busy || readBusy || !!pending" @close="decision = undefined" @submit="requestRevision" />
      <SigningDecisionDialog v-if="decision === 'rejection'" v-model="rejectionReason" :error="error" kind="rejection" :open="decision === 'rejection'" :busy="rejectionBusy" :disabled="rejectionReason.trim().length < 3 || revisionBusy || busy || readBusy || !!pending" @close="decision = undefined" @submit="reject" />
    </template>
  </div>
</template>

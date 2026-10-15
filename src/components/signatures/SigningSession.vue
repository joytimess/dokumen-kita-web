<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import { createSignatureAction } from '../../composables/useSignatureAction'
import type { Assignment, Placeholder, RevisionResult, SignatureAsset } from '../../types/documents'
import PdfViewer from '../documents/PdfViewer.vue'
import AssetLibrary from './AssetLibrary.vue'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
const props = defineProps<{
  versionGuid: string
  title: string
  versionNumber?: number
  assignment?: Assignment
  expectedHash?: string | null
  owner?: boolean
  status: string
  isCurrent?: boolean
  refresh?: () => Promise<void>
  contextComplete?: boolean
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
const revisionReason = ref(''), revisionBusy = ref(false), revisionResult = ref<RevisionResult>()
const selected = ref<SignatureAsset>(),
  assetUrl = ref(''),
  dialog = ref<HTMLDialogElement>(),
  dialogOpen = ref(false)
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
const canSign = computed(
  () =>
    props.contextComplete !== false &&
    props.assignment?.status === 'ready' &&
    !!props.assignment.claimed_at &&
    !!props.assignment.placeholders?.length &&
    auth.user?.email_verified &&
    auth.user.guid === identity &&
    props.isCurrent !== false &&
    props.status === 'in_progress',
)
const canRequestRevision = computed(() => props.assignment?.status === 'ready' &&
  !!props.assignment.claimed_at && auth.user?.email_verified && auth.user.guid === identity &&
  props.isCurrent !== false &&
  props.status === 'in_progress')
const overlays = computed<(Placeholder & { label: string; image?: string })[]>(() =>
  (props.assignment?.placeholders ?? []).map((p) => ({
    ...p,
    label: props.assignment!.recipient_email,
    image: assetUrl.value || undefined,
  })),
)
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
      close()
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
  if (pending.value || busy.value) return
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
function cancel(event: Event) {
  if (busy.value || readBusy.value) event.preventDefault()
  else close()
}
async function open() {
  if (!canSign.value || !eligible.value || !confirmed.value || !hash.value || remaining.value)
    return
  dialogOpen.value = true
  await nextTick()
  dialog.value?.showModal()
}
function close() {
  dialog.value?.close()
  dialogOpen.value = false
}
async function submit() {
  if (
    !selected.value ||
    !assetUrl.value ||
    !canSign.value ||
    !eligible.value ||
    !confirmed.value ||
    !hash.value ||
    busy.value ||
    readBusy.value ||
    blocked.value ||
    remaining.value
  )
    return
  error.value = ''
  try {
    if (!pending.value && props.refresh) {
      await props.refresh()
      await nextTick()
      if (!active || !canSign.value || !hash.value || !eligible.value || !confirmed.value) return
    }
    if (!readConfirmed.value) {
      readBusy.value = true
      await documentsApi.read(props.assignment!.guid, hash.value)
      if (!active) return
      readConfirmed.value = true
      readBusy.value = false
    }
    await action.sign(selected.value.guid, hash.value)
    if (!active || auth.user?.guid !== identity) return
    close()
    message.value =
      'Persetujuan tanda tangan diterima server. Status versi ditentukan oleh pemeriksaan terbaru, bukan preview overlay.'
    emit('signed')
    await props.refresh?.()
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
  }
}
async function requestRevision() {
  const reason = revisionReason.value.trim()
  if (!canRequestRevision.value || reason.length < 3 || reason.length > 1000 || revisionBusy.value || busy.value || readBusy.value || pending.value ||
    !window.confirm('Versi ini akan dihentikan. Semua penerima harus membaca dan menandatangani ulang draft baru. Lanjutkan?')) return
  revisionBusy.value = true
  error.value = ''
  try {
    const result = await documentsApi.requestRevision(props.assignment!.guid, reason)
    revisionResult.value = result
    blocked.value = true
    message.value = 'Permintaan revisi diterima. Versi ini tidak aktif lagi.'
    await props.refresh?.()
  } catch (cause) {
    const feedback = workspaceError(cause)
    error.value = feedback.message
    if (feedback.status === 401) auth.user = null
    else if ([403, 404, 409, 422].includes(feedback.status ?? 0)) await props.refresh?.()
  }
  finally { revisionBusy.value = false }
}
onUnmounted(() => {
  active = false
  clearInterval(timer)
  action.dispose()
  revoke()
  close()
})
</script>
<template>
  <div class="grid min-w-0 gap-5">
    <FeedbackMessage :message="message" /><FeedbackMessage :message="error" error /><PdfViewer
      :version-guid="versionGuid"
      :expected-hash="expectedHash"
      :overlays="overlays"
      @ready="ready"
      @gate="gate"
      @failure="pdfFailure"
    />
    <section v-if="assignment" class="rounded-xl border border-line bg-white p-5">
      <h2 class="font-semibold">Persetujuan Anda</h2>
      <div v-if="revisionResult" class="mt-3 text-sm"><p>Versi sebelumnya: {{ revisionResult.previous_status }}. Draft penerus: {{ revisionResult.draft_status }}.</p><RouterLink v-if="assignment.document_guid" :to="`/documents/${assignment.document_guid}`" class="mt-2 inline-block text-primary underline">Buka detail dokumen</RouterLink></div>
      <p v-if="completed || assignment.status === 'signed'" class="mt-3 text-sm">
        Tanda tangan telah diterima. Tindakan baru tidak tersedia untuk persetujuan ini.
      </p>
      <template v-else-if="canSign && !revisionResult"
        ><p class="my-3 text-sm text-muted">
          Kunjungi semua halaman yang berhasil dirender dan capai akhir dokumen. Pencarian atau
          lompat ke halaman terakhir saja tidak memenuhi syarat.
        </p>
        <p v-if="!hash" class="my-3 text-sm text-error">
          Hash versi resmi belum tersedia. Persetujuan diblokir.
        </p>
        <label class="my-4 flex items-start gap-3 text-sm"
          ><input
            v-model="confirmed"
            type="checkbox"
            class="mt-1 accent-primary"
            :disabled="!eligible || !hash || busy || blocked"
          />Saya telah membaca dokumen versi ini.</label
        ><BaseButton
          :disabled="!eligible || !confirmed || !hash || blocked || remaining > 0"
          @click="open"
          >{{ pending ? 'Tinjau ulang percobaan yang sama' : 'Pilih tanda tangan' }}</BaseButton
        >
        <p v-if="remaining" class="mt-3 text-xs text-muted">
          Coba kembali dalam {{ remaining }} detik.
        </p></template
      >
      <div v-if="canRequestRevision && !revisionResult" class="mt-6 border-t border-line pt-5">
        <h3 class="font-semibold">Minta revisi</h3>
        <p class="my-2 text-xs text-muted">Versi ini akan dihentikan dan semua tanda tangan perlu diulang pada draft baru.</p>
        <textarea v-model="revisionReason" minlength="3" maxlength="1000" class="min-h-28 w-full rounded border border-line p-3 text-sm" placeholder="Alasan revisi (3–1000 karakter)" />
        <BaseButton class="mt-3" :loading="revisionBusy" :disabled="revisionReason.trim().length < 3 || busy || readBusy || !!pending" @click="requestRevision">Minta revisi</BaseButton>
      </div>
      <p v-else-if="contextComplete === false" class="mt-3 text-sm text-muted">
        Metadata judul dan nomor versi belum tersedia dari respons klaim. Persetujuan memerlukan
        detail dokumen berizin yang lengkap; PDF tetap dapat dibaca.
      </p>
      <p v-else class="mt-3 text-sm text-muted">
        Tindakan belum tersedia: akun harus mengklaim undangan, terverifikasi, dan mendapat giliran
        aktif.
      </p>
    </section>
    <dialog
      ref="dialog"
      class="m-auto max-h-[90dvh] w-[calc(100%-24px)] max-w-3xl overflow-auto rounded-xl border border-line bg-soft p-4 text-ink shadow-xl backdrop:bg-ink/40 sm:p-7"
      aria-labelledby="sign-title"
      @cancel="cancel"
    >
      <div class="mb-5 flex items-start justify-between gap-3">
        <div>
          <h2 id="sign-title" class="text-xl font-semibold">Konfirmasi tanda tangan</h2>
          <p class="mt-2 text-sm wrap-anywhere">
            {{ title }} · {{ versionNumber ? `Versi ${versionNumber}` : 'Snapshot undangan' }}
          </p>
          <p class="mt-2 text-xs text-muted wrap-anywhere">
            {{ auth.user?.name }} · {{ auth.user?.email }} ·
            {{ assignment?.placeholders?.length ?? 0 }} area
          </p>
        </div>
        <button
          class="min-h-11 px-3 text-sm text-primary"
          :disabled="busy || readBusy"
          aria-label="Tutup dialog"
          @click="close"
        >
          Tutup
        </button>
      </div>
      <template v-if="dialogOpen"
        ><AssetLibrary
          selectable
          :selected="selected?.guid"
          :disabled="!!pending || busy || readBusy"
          @select="select"
        />
        <div v-if="assetUrl" class="my-4 rounded-lg border border-line bg-white p-4">
          <img :src="assetUrl" alt="Tanda tangan pilihan Anda" class="h-24 w-full object-contain" />
          <p class="mt-2 text-xs text-muted">
            Preview ini diterapkan ke {{ overlays.length }} area milik Anda. Tutup dialog untuk
            meninjau penempatan pada snapshot sebelum menyetujui.
          </p>
        </div>
        <FeedbackMessage :message="error" error />
        <p v-if="pending && !completed" class="my-3 text-xs text-muted">
          Percobaan berikut mempertahankan aset, hash, dan kunci tindakan yang sama. Jangan membuat
          tindakan baru saat hasil belum pasti.
        </p>
        <BaseButton
          :loading="busy || readBusy"
          :disabled="!selected || !assetUrl || blocked || remaining > 0"
          @click="submit"
          >{{
            pending ? 'Coba persetujuan yang sama' : 'Konfirmasi baca dan tanda tangani'
          }}</BaseButton
        ></template
      >
    </dialog>
  </div>
</template>

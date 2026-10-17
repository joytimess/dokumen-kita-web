<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import { confirmAction, notify } from '../../services/feedback'
import { dateLabel, ownAssignment, statusLabel } from '../../utils/documents'
import { formatNumber, t } from '../../services/workspace-language'
import type { Assignment, AuditEvent, DocumentRecord, DocumentVersion, EmailNotification, Page } from '../../types/documents'
import StatusBadge from '../../components/documents/StatusBadge.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
const route = useRoute(),
  auth = useAuthStore()
const document = ref<DocumentRecord>(),
  message = ref(''),
  clock = ref(Date.now()),
  blocked = ref<Record<string, number>>({}),
  audit = ref<Page<AuditEvent>>(),
  versions = ref<Page<DocumentVersion>>(),
  emails = ref<Page<EmailNotification>>(),
  activityBusy = ref<Record<string, boolean>>({}),
  activityErrors = ref<Record<string, string>>({}),
  activityKey = ref(''),
  auditExpanded = ref(false)
const { busy, error, run } = useWorkspaceRequest()
const owner = computed(() => document.value?.owner_guid === auth.user?.guid)
const recentAudit = computed(() =>
  auditExpanded.value ? audit.value?.data ?? [] : (audit.value?.data ?? []).slice(0, 3),
)
const assignment = computed(() =>
  document.value && auth.user ? ownAssignment(document.value, auth.user) : undefined,
)
const canRead = computed(
  () =>
    owner.value ||
    (assignment.value &&
      ['ready', 'signed', 'revision_requested', 'rejected'].includes(assignment.value.status)),
)
let lastLoad = 0,
  timer: ReturnType<typeof setInterval> | undefined, pollTimer: ReturnType<typeof setTimeout> | undefined, active = true, polls = 0
const emailStatusLabel = (status: string) => t(({ queued: 'Menunggu pengiriman', sent: 'Dikirim oleh transport', failed: 'Gagal', cancelled: 'Dibatalkan' })[status] ?? status)
async function load() {
  lastLoad = Date.now()
  const result = await run(() => documentsApi.detail(String(route.params.documentGuid)))
  if (result && active) {
    document.value = result
    const key = `${result.guid}:${auth.user?.guid}`
    if (key !== activityKey.value) {
      activityKey.value = key
      auditExpanded.value = false
      audit.value = undefined
      versions.value = undefined
      emails.value = undefined
      void loadActivity('audit', 1)
      void loadActivity('versions', 1)
      if (result.owner_guid === auth.user?.guid) void loadActivity('emails', 1)
    }
  }
  clearTimeout(pollTimer)
  if (active && result?.current_version.status === 'finalizing' && !result.current_version.finalization_error_code && polls < 30)
    pollTimer = setTimeout(() => { if (globalThis.document.visibilityState === 'visible') { polls++; void load() } }, 5000)
}
async function loadActivity(kind: 'audit' | 'versions' | 'emails', page: number) {
  if (!document.value) return
  const guid = document.value.guid
  const identity = auth.user?.guid
  activityBusy.value[kind] = true
  activityErrors.value[kind] = ''
  try {
    const result = await documentsApi[kind](document.value.guid, page)
    if (!active || document.value?.guid !== guid || auth.user?.guid !== identity) return
    if (kind === 'audit') audit.value = result as Page<AuditEvent>
    else if (kind === 'versions') versions.value = result as Page<DocumentVersion>
    else emails.value = result as Page<EmailNotification>
  } catch (cause) {
    if (active && document.value?.guid === guid && auth.user?.guid === identity)
      activityErrors.value[kind] = workspaceError(cause).message
  } finally {
    if (active) activityBusy.value[kind] = false
  }
}
async function retryFinalization() {
  if (!document.value) return
  if (!(await confirmAction(t('Susun ulang PDF final dokumen ini?'), {
    title: t('Susun PDF final'), action: t('Susun ulang'),
  }))) return
  const result = await run(() => documentsApi.finalize(document.value!.current_version.guid))
  if (result) { message.value = 'Permintaan penyusunan PDF final diterima.'; notify.success(message.value); await load() }
}
function focus() {
  if (
    globalThis.document.visibilityState === 'visible' &&
    Date.now() - lastLoad >= 5000 &&
    !busy.value
  ) {
    polls = 0
    void load()
  }
}
async function resend(a: Assignment) {
  if (
    (blocked.value[a.guid] ?? 0) > clock.value ||
    !(await confirmAction(t('Minta ulang undangan? Link lama akan diganti.'), {
      title: t('Kirim ulang undangan'), action: t('Kirim ulang'),
    }))
  )
    return
  const result = await run(async () => {
    try {
      return await documentsApi.resend(a.guid)
    } catch (cause) {
      const feedback = workspaceError(cause)
      if (feedback.retryAt) blocked.value[a.guid] = feedback.retryAt
      throw cause
    }
  })
  if (result)
    message.value =
      'Permintaan undangan diterima dan link diperbarui. Email belum dipastikan masuk inbox.'
  if (result) notify.success(message.value)
}
const remaining = (guid: string) =>
  Math.max(0, Math.ceil(((blocked.value[guid] ?? 0) - clock.value) / 1000))
onMounted(() => {
  void load()
  window.addEventListener('focus', focus)
  timer = setInterval(() => {
    clock.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  active = false
  clearTimeout(pollTimer)
  clearInterval(timer)
  window.removeEventListener('focus', focus)
})
</script>
<template>
  <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
    <div>
      <RouterLink to="/documents" class="text-xs text-primary underline">← {{ t('Dokumen Saya') }}</RouterLink>
      <h1 class="mt-3 text-3xl font-semibold wrap-anywhere">
        <span class="text-muted">{{ t('Dokumen:') }}</span> {{ document?.title || t('Detail dokumen') }}
      </h1>
      <p v-if="document" class="mt-2 text-sm text-muted">
        {{ t(statusLabel(document.current_version.status)) }} ·
        {{ t('Versi :number', { number: formatNumber(document.current_version.version_number) }) }} ·
        {{ t('Dibuat :date', { date: dateLabel(document.created_at) }) }}
      </p>
    </div>
    <RouterLink
      v-if="document && owner && document.current_version.status === 'draft'"
      :to="`/documents/${document.guid}/edit`"
      class="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-[#174c39]"
      >{{ t('Lanjutkan penyusunan') }}</RouterLink
    >
  </div>
  <FeedbackMessage :message="t(error)" error /><FeedbackMessage :message="t(message)" />
  <p v-if="busy && !document" role="status" class="py-8 text-sm text-muted">{{ t('Memuat dokumen…') }}</p>
  <template v-if="document"
    ><div :class="owner ? 'detail-grid' : 'detail-grid detail-grid--shared'">
      <section class="detail-summary rounded-xl border border-line bg-white p-5 sm:p-8">
      <div class="mb-5 flex flex-wrap items-center gap-3">
        <h2 class="text-lg font-semibold">{{ t('Ringkasan dokumen') }}</h2>
        <BaseButton class="ml-auto" :loading="busy" @click="load">{{ t('Periksa status') }}</BaseButton>
      </div>
      <p class="text-sm text-muted">
        {{ t(statusLabel(document.current_version.status)) }} ·
        {{ t('Versi :number', { number: formatNumber(document.current_version.version_number) }) }} ·
        {{ t('Diperbarui') }} {{ dateLabel(document.updated_at) }}
      </p>
      <p
        v-if="document.current_version.status === 'finalizing'"
        class="mt-5 text-sm leading-relaxed"
      >
        {{ t('Semua persetujuan diterima. PDF final sedang disiapkan.') }}
      </p>
      <p v-if="owner && document.current_version.finalization_error_code" class="mt-3 text-sm text-error">{{ t('Penyusunan PDF final gagal. Periksa status lalu coba lagi.') }}</p>
      <BaseButton v-if="owner && document.current_version.status === 'finalizing' && document.current_version.finalization_error_code" class="mt-3" :loading="busy" @click="retryFinalization">{{ t('Coba susun PDF final lagi') }}</BaseButton>
      <p v-if="assignment?.status === 'waiting'" class="mt-5 text-sm">
        {{ t('Anda menunggu giliran. PDF dan posisi tanda tangan belum dibuka melalui hak penerima.') }}
      </p>
      <div class="mt-6 flex flex-wrap gap-4">
        <RouterLink
          v-if="
            canRead &&
            (document.current_version.preview_status === 'ready' ||
              document.current_version.status === 'completed')
          "
          :to="`/documents/${document.guid}/versions/${document.current_version.guid}/view`"
          class="inline-flex min-h-12 items-center rounded-lg border border-line px-5 text-sm text-primary"
          >{{
            document.current_version.status === 'completed'
              ? t('Buka PDF final')
              : t('Buka snapshot / preview')
          }}</RouterLink
        >
      </div>
      <p
        v-if="
          owner &&
          document.current_version.preview_status !== 'ready' &&
          document.current_version.status !== 'completed'
        "
        class="mt-5 text-sm text-muted"
      >
        {{ t('Pratinjau terbaru belum tersedia. Buka draft untuk membuat pratinjau dari editor.') }}
      </p>
      <RouterLink
        v-if="
          owner &&
          document.current_version.assignments?.some(
            (a) =>
              a.recipient_email.toLowerCase() === auth.user?.email.toLowerCase() && !a.claimed_at,
          )
        "
        to="/invitations/claim"
        class="mt-4 inline-flex min-h-11 items-center text-sm text-primary underline"
        >{{ t('Buka tautan undangan asli Anda untuk mengklaim giliran sendiri.') }}</RouterLink
      >
    </section>
    <section class="detail-recipients rounded-xl border border-line bg-white p-5 sm:p-8">
      <h2 class="mb-5 text-xl font-semibold">
        {{ owner ? t('Penerima dan progres') : t('Giliran Anda') }}
      </h2>
      <p v-if="!document.current_version.assignments?.length" class="text-sm text-muted">
        {{ t('Belum ada penerima.') }}
      </p>
      <div
        v-for="a in document.current_version.assignments"
        :key="a.guid"
        class="flex flex-wrap items-center justify-between gap-3 border-t border-line py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-semibold wrap-anywhere">
            {{ formatNumber(a.sequence_number) }}. {{ a.recipient_email }}
          </p>
          <p v-if="a.signature" class="mt-2 text-xs text-muted">
            {{ t('Ditandatangani :date', { date: dateLabel(a.signature.signed_at) }) }}
          </p>
        </div>
        <StatusBadge :status="a.status" /><button
          v-if="
            owner &&
            document.current_version.status === 'in_progress' &&
            a.status === 'ready'
          "
          class="min-h-11 text-xs text-primary underline disabled:opacity-40"
          :disabled="busy || remaining(a.guid) > 0"
          @click="resend(a)"
        >
          {{ remaining(a.guid) ? t('Tunggu :seconds detik', { seconds: formatNumber(remaining(a.guid)) }) : t('Kirim ulang undangan') }}
        </button>
      </div>
      <RouterLink
        v-if="owner && document.current_version.status === 'draft'"
        :to="`/documents/${document.guid}/edit`"
        class="mt-2 inline-flex min-h-10 items-center text-sm font-medium text-primary underline"
        >+ {{ t('Tambah penerima') }}</RouterLink
      >
    </section>
    <section class="detail-activity rounded-xl border border-line bg-white p-5 sm:p-8">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-xl font-semibold">{{ t('Aktivitas terbaru') }}</h2>
        <button
          v-if="audit && (audit.data.length > 3 || audit.meta.last_page > 1)"
          type="button"
          class="min-h-10 text-sm text-primary underline"
          @click="auditExpanded = !auditExpanded"
          >{{ t(auditExpanded ? 'Lihat lebih sedikit' : 'Lihat semua') }}</button
        >
      </div>
      <p v-if="activityBusy.audit" role="status" class="text-sm text-muted">{{ t('Memuat aktivitas…') }}</p>
      <FeedbackMessage :message="t(activityErrors.audit || '')" error />
      <p v-if="audit && !audit.data.length && !activityBusy.audit" class="text-sm text-muted">{{ t('Belum ada aktivitas.') }}</p>
      <div v-for="event in recentAudit" :key="event.guid" class="border-t border-line py-3">
        <p class="text-sm font-medium">{{ t(event.action) }}</p>
        <p v-if="event.metadata?.reason" class="mt-1 text-sm">{{ t('Alasan') }}: {{ event.metadata.reason }}</p>
        <p class="mt-1 text-xs text-muted">{{ dateLabel(event.created_at) }}</p>
        <p v-if="auditExpanded && event.version_guid" class="mt-1 text-xs text-muted">{{ t('Versi') }} {{ event.version_guid }}</p>
      </div>
      <div v-if="auditExpanded && audit && audit.meta.last_page > 1" class="mt-4 flex items-center gap-3 text-sm">
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.audit || audit.meta.current_page <= 1" @click="loadActivity('audit', audit.meta.current_page - 1)">{{ t('Sebelumnya') }}</button>
        <span>{{ t('Halaman :current dari :last', { current: formatNumber(audit.meta.current_page), last: formatNumber(audit.meta.last_page) }) }}</span>
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.audit || audit.meta.current_page >= audit.meta.last_page" @click="loadActivity('audit', audit.meta.current_page + 1)">{{ t('Berikutnya') }}</button>
      </div>
    </section>
    <section class="detail-versions rounded-xl border border-line bg-white p-5 sm:p-8">
      <h2 class="mb-4 text-xl font-semibold">{{ t('Riwayat versi') }}</h2>
      <p v-if="activityBusy.versions" role="status" class="text-sm text-muted">{{ t('Memuat versi…') }}</p>
      <FeedbackMessage :message="t(activityErrors.versions || '')" error />
      <p v-if="versions && !versions.data.length && !activityBusy.versions" class="text-sm text-muted">{{ t('Belum ada riwayat versi.') }}</p>
      <div v-for="version in versions?.data" :key="version.guid" class="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
        <div>
          <p class="text-sm font-medium">{{ t('Versi :number · :status', { number: formatNumber(version.version_number), status: statusLabel(version.status) }) }}</p>
          <p class="text-xs text-muted">{{ dateLabel(version.updated_at) }}</p>
        </div>
        <RouterLink :to="`/documents/${document.guid}/versions/${version.guid}/view`" class="min-h-11 inline-flex items-center text-sm text-primary underline">{{ t('Buka') }}</RouterLink>
      </div>
      <div v-if="versions && versions.meta.last_page > 1" class="mt-4 flex items-center gap-3 text-sm">
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.versions || versions.meta.current_page <= 1" @click="loadActivity('versions', versions.meta.current_page - 1)">{{ t('Sebelumnya') }}</button>
        <span>{{ t('Halaman :current dari :last', { current: formatNumber(versions.meta.current_page), last: formatNumber(versions.meta.last_page) }) }}</span>
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.versions || versions.meta.current_page >= versions.meta.last_page" @click="loadActivity('versions', versions.meta.current_page + 1)">{{ t('Berikutnya') }}</button>
      </div>
    </section>
    <section v-if="owner" class="detail-emails rounded-xl border border-line bg-white p-5 sm:p-8">
      <h2 class="mb-4 text-xl font-semibold">{{ t('Status email') }}</h2>
      <p class="mb-3 text-xs text-muted">{{ t('Status sent berarti transport menerima email, bukan bukti email masuk ke inbox.') }}</p>
      <p v-if="activityBusy.emails" role="status" class="text-sm text-muted">{{ t('Memuat status email…') }}</p>
      <FeedbackMessage :message="t(activityErrors.emails || '')" error />
      <p v-if="emails && !emails.data.length && !activityBusy.emails" class="text-sm text-muted">{{ t('Belum ada catatan email.') }}</p>
      <div v-for="email in emails?.data" :key="email.guid" class="border-t border-line py-3">
        <p class="text-sm font-medium">{{ t(email.notification_type) }} · {{ emailStatusLabel(email.status) }}</p>
        <p class="mt-1 text-xs text-muted">{{ email.recipient_email }} · {{ dateLabel(email.sent_at || email.created_at) }} · {{ t('Percobaan :count', { count: formatNumber(email.attempt_count) }) }}</p>
      </div>
      <div v-if="emails && emails.meta.last_page > 1" class="mt-4 flex items-center gap-3 text-sm">
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.emails || emails.meta.current_page <= 1" @click="loadActivity('emails', emails.meta.current_page - 1)">{{ t('Sebelumnya') }}</button>
        <span>{{ t('Halaman :current dari :last', { current: formatNumber(emails.meta.current_page), last: formatNumber(emails.meta.last_page) }) }}</span>
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.emails || emails.meta.current_page >= emails.meta.last_page" @click="loadActivity('emails', emails.meta.current_page + 1)">{{ t('Berikutnya') }}</button>
      </div>
    </section>
    </div></template
  >
</template>

<style scoped>
.detail-grid {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: 'summary' 'recipients' 'versions' 'emails' 'activity';
}

.detail-grid--shared {
  grid-template-areas: 'summary' 'recipients' 'versions' 'activity';
}

.detail-summary { grid-area: summary; }
.detail-recipients { grid-area: recipients; }
.detail-activity { grid-area: activity; }
.detail-versions { grid-area: versions; }
.detail-emails { grid-area: emails; }

@media (min-width: 1024px) {
  .detail-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-areas: 'summary recipients' 'versions emails' 'activity activity';
  }

  .detail-grid--shared {
    grid-template-areas: 'summary recipients' 'versions activity';
  }
}
</style>

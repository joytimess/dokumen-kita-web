<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import { confirmAction, notify } from '../../services/feedback'
import { dateLabel, ownAssignment } from '../../utils/documents'
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
  activityKey = ref('')
const { busy, error, run } = useWorkspaceRequest()
const owner = computed(() => document.value?.owner_guid === auth.user?.guid)
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
const emailStatusLabel = (status: string) => ({ queued: 'Menunggu pengiriman', sent: 'Dikirim oleh transport', failed: 'Gagal', cancelled: 'Dibatalkan' })[status] ?? status
async function load() {
  lastLoad = Date.now()
  const result = await run(() => documentsApi.detail(String(route.params.documentGuid)))
  if (result && active) {
    document.value = result
    const key = `${result.guid}:${auth.user?.guid}`
    if (key !== activityKey.value) {
      activityKey.value = key
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
  if (!(await confirmAction('Susun ulang PDF final dokumen ini?', {
    title: 'Susun PDF final', action: 'Susun ulang',
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
    !(await confirmAction('Minta ulang undangan? Link lama akan diganti.', {
      title: 'Kirim ulang undangan', action: 'Kirim ulang',
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
      <RouterLink to="/documents" class="text-xs text-primary underline">← Dokumen Saya</RouterLink>
      <h1 class="mt-3 text-3xl font-semibold wrap-anywhere">
        {{ document?.title || 'Detail dokumen' }}
      </h1>
    </div>
    <BaseButton :loading="busy" @click="load">Periksa status</BaseButton>
  </div>
  <FeedbackMessage :message="error" error /><FeedbackMessage :message="message" />
  <p v-if="busy && !document" role="status" class="py-8 text-sm text-muted">Memuat dokumen…</p>
  <template v-if="document"
    ><section class="rounded-xl border border-line bg-white p-5 sm:p-8">
      <div class="mb-5 flex flex-wrap items-center gap-3">
        <StatusBadge :status="document.current_version.status" /><span class="text-xs text-muted"
          >Versi {{ document.current_version.version_number }}</span
        >
      </div>
      <p class="text-xs text-muted">
        Dibuat {{ dateLabel(document.created_at) }} · Diperbarui
        {{ dateLabel(document.updated_at) }}
      </p>
      <p
        v-if="document.current_version.status === 'finalizing'"
        class="mt-5 text-sm leading-relaxed"
      >
        Semua persetujuan diterima. PDF final sedang disiapkan.
      </p>
      <p v-if="owner && document.current_version.finalization_error_code" class="mt-3 text-sm text-error">Penyusunan PDF final gagal. Periksa status lalu coba lagi.</p>
      <BaseButton v-if="owner && document.current_version.status === 'finalizing' && document.current_version.finalization_error_code" class="mt-3" :loading="busy" @click="retryFinalization">Coba susun PDF final lagi</BaseButton>
      <p v-if="assignment?.status === 'waiting'" class="mt-5 text-sm">
        Anda menunggu giliran. PDF dan posisi tanda tangan belum dibuka melalui hak penerima.
      </p>
      <div class="mt-6 flex flex-wrap gap-4">
        <RouterLink
          v-if="owner && document.current_version.status === 'draft'"
          :to="`/documents/${document.guid}/edit`"
          class="inline-flex min-h-12 items-center rounded-lg bg-primary px-5 text-sm text-white"
          >Lanjutkan penyusunan</RouterLink
        ><RouterLink
          v-if="
            canRead &&
            (document.current_version.preview_status === 'ready' ||
              document.current_version.status === 'completed')
          "
          :to="`/documents/${document.guid}/versions/${document.current_version.guid}/view`"
          class="inline-flex min-h-12 items-center rounded-lg border border-line px-5 text-sm text-primary"
          >{{
            document.current_version.status === 'completed'
              ? 'Buka PDF final'
              : 'Buka snapshot / preview'
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
        Pratinjau terbaru belum tersedia. Buka draft untuk membuat pratinjau dari editor.
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
        >Buka tautan undangan asli Anda untuk mengklaim giliran sendiri.</RouterLink
      >
    </section>
    <section class="mt-6 rounded-xl border border-line bg-white p-5 sm:p-8">
      <h2 class="mb-5 text-xl font-semibold">
        {{ owner ? 'Penerima dan progres' : 'Giliran Anda' }}
      </h2>
      <p v-if="!document.current_version.assignments?.length" class="text-sm text-muted">
        Belum ada penerima.
      </p>
      <div
        v-for="a in document.current_version.assignments"
        :key="a.guid"
        class="flex flex-wrap items-center justify-between gap-3 border-t border-line py-4"
      >
        <div class="min-w-0">
          <p class="text-sm font-semibold wrap-anywhere">
            {{ a.sequence_number }}. {{ a.recipient_email }}
          </p>
          <p v-if="a.signature" class="mt-2 text-xs text-muted">
            Ditandatangani {{ dateLabel(a.signature.signed_at) }}
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
          {{ remaining(a.guid) ? `Tunggu ${remaining(a.guid)} detik` : 'Kirim ulang undangan' }}
        </button>
      </div>
    </section>
    <section class="mt-6 rounded-xl border border-line bg-white p-5 sm:p-8">
      <h2 class="mb-4 text-xl font-semibold">Audit aktivitas</h2>
      <p v-if="activityBusy.audit" role="status" class="text-sm text-muted">Memuat aktivitas…</p>
      <FeedbackMessage :message="activityErrors.audit || ''" error />
      <p v-if="audit && !audit.data.length && !activityBusy.audit" class="text-sm text-muted">Belum ada aktivitas.</p>
      <div v-for="event in audit?.data" :key="event.guid" class="border-t border-line py-3">
        <p class="text-sm font-medium">{{ event.action }} · Versi {{ event.version_guid || '—' }}</p>
        <p v-if="event.metadata?.reason" class="mt-1 text-sm">Alasan: {{ event.metadata.reason }}</p>
        <p class="mt-1 text-xs text-muted">{{ dateLabel(event.created_at) }}</p>
      </div>
      <div v-if="audit && audit.meta.last_page > 1" class="mt-4 flex items-center gap-3 text-sm">
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.audit || audit.meta.current_page <= 1" @click="loadActivity('audit', audit.meta.current_page - 1)">Sebelumnya</button>
        <span>Halaman {{ audit.meta.current_page }} dari {{ audit.meta.last_page }}</span>
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.audit || audit.meta.current_page >= audit.meta.last_page" @click="loadActivity('audit', audit.meta.current_page + 1)">Berikutnya</button>
      </div>
    </section>
    <section class="mt-6 rounded-xl border border-line bg-white p-5 sm:p-8">
      <h2 class="mb-4 text-xl font-semibold">Riwayat versi</h2>
      <p v-if="activityBusy.versions" role="status" class="text-sm text-muted">Memuat versi…</p>
      <FeedbackMessage :message="activityErrors.versions || ''" error />
      <p v-if="versions && !versions.data.length && !activityBusy.versions" class="text-sm text-muted">Belum ada riwayat versi.</p>
      <div v-for="version in versions?.data" :key="version.guid" class="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
        <div>
          <p class="text-sm font-medium">Versi {{ version.version_number }} · {{ version.status }}</p>
          <p class="text-xs text-muted">{{ dateLabel(version.updated_at) }}</p>
        </div>
        <RouterLink :to="`/documents/${document.guid}/versions/${version.guid}/view`" class="min-h-11 inline-flex items-center text-sm text-primary underline">Buka versi</RouterLink>
      </div>
      <div v-if="versions && versions.meta.last_page > 1" class="mt-4 flex items-center gap-3 text-sm">
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.versions || versions.meta.current_page <= 1" @click="loadActivity('versions', versions.meta.current_page - 1)">Sebelumnya</button>
        <span>Halaman {{ versions.meta.current_page }} dari {{ versions.meta.last_page }}</span>
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.versions || versions.meta.current_page >= versions.meta.last_page" @click="loadActivity('versions', versions.meta.current_page + 1)">Berikutnya</button>
      </div>
    </section>
    <section v-if="owner" class="mt-6 rounded-xl border border-line bg-white p-5 sm:p-8">
      <h2 class="mb-4 text-xl font-semibold">Status email</h2>
      <p class="mb-3 text-xs text-muted">Status sent berarti transport menerima email, bukan bukti email masuk ke inbox.</p>
      <p v-if="activityBusy.emails" role="status" class="text-sm text-muted">Memuat status email…</p>
      <FeedbackMessage :message="activityErrors.emails || ''" error />
      <p v-if="emails && !emails.data.length && !activityBusy.emails" class="text-sm text-muted">Belum ada catatan email.</p>
      <div v-for="email in emails?.data" :key="email.guid" class="border-t border-line py-3">
        <p class="text-sm font-medium">{{ email.notification_type }} · {{ emailStatusLabel(email.status) }}</p>
        <p class="mt-1 text-xs text-muted">{{ email.recipient_email }} · {{ dateLabel(email.sent_at || email.created_at) }} · Percobaan {{ email.attempt_count }}</p>
      </div>
      <div v-if="emails && emails.meta.last_page > 1" class="mt-4 flex items-center gap-3 text-sm">
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.emails || emails.meta.current_page <= 1" @click="loadActivity('emails', emails.meta.current_page - 1)">Sebelumnya</button>
        <span>Halaman {{ emails.meta.current_page }} dari {{ emails.meta.last_page }}</span>
        <button class="min-h-11 text-primary underline disabled:opacity-40" :disabled="activityBusy.emails || emails.meta.current_page >= emails.meta.last_page" @click="loadActivity('emails', emails.meta.current_page + 1)">Berikutnya</button>
      </div>
    </section></template
  >
</template>

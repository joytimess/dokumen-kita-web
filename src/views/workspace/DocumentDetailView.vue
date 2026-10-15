<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import { dateLabel, ownAssignment } from '../../utils/documents'
import type { Assignment, DocumentRecord } from '../../types/documents'
import StatusBadge from '../../components/documents/StatusBadge.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
const route = useRoute(),
  auth = useAuthStore()
const document = ref<DocumentRecord>(),
  message = ref(''),
  clock = ref(Date.now()),
  blocked = ref<Record<string, number>>({})
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
  timer: ReturnType<typeof setInterval> | undefined
async function load() {
  lastLoad = Date.now()
  const result = await run(() => documentsApi.detail(String(route.params.documentGuid)))
  if (result) document.value = result
}
function focus() {
  if (
    globalThis.document.visibilityState === 'visible' &&
    Date.now() - lastLoad >= 5000 &&
    !busy.value
  )
    void load()
}
async function resend(a: Assignment) {
  if (
    (blocked.value[a.guid] ?? 0) > clock.value ||
    !window.confirm('Minta ulang undangan? Link lama akan diganti.')
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
        Semua persetujuan diterima. Hasil final belum tersedia; backend saat ini belum memiliki
        proses pembentukan PDF final otomatis.
      </p>
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
        Pratinjau belum tersedia. Berkas sumber tidak otomatis menjadi snapshot; penempatan dan
        publish menunggu snapshot backend yang valid.
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
            ['ready', 'waiting'].includes(a.status)
          "
          class="min-h-11 text-xs text-primary underline disabled:opacity-40"
          :disabled="busy || remaining(a.guid) > 0"
          @click="resend(a)"
        >
          {{ remaining(a.guid) ? `Tunggu ${remaining(a.guid)} detik` : 'Kirim ulang undangan' }}
        </button>
      </div>
    </section></template
  >
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { documentsApi } from '../../services/documents.service'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import type { DocumentVersion } from '../../types/documents'
import SigningSession from '../../components/signatures/SigningSession.vue'
import StatusBadge from '../../components/documents/StatusBadge.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
import { formatNumber, t } from '../../services/workspace-language'
const route = useRoute(), auth = useAuthStore(), version = ref<DocumentVersion>()
const { busy, error, run } = useWorkspaceRequest()
const owner = computed(() => version.value?.editor_revision !== undefined)
const assignment = computed(() => {
  const assignments = version.value?.assignments ?? []
  return owner.value
    ? assignments.find(a => a.recipient_email.toLowerCase() === auth.user?.email.toLowerCase())
    : assignments[0]
})
const canView = computed(() => owner.value || (assignment.value && ['ready', 'signed', 'revision_requested', 'rejected'].includes(assignment.value.status)))
let active = true, request = 0, polls = 0, timer: ReturnType<typeof setTimeout> | undefined
async function load() {
  const id = ++request
  const guid = String(route.params.versionGuid)
  const result = await run(() => documentsApi.version(guid))
  if (!active || id !== request || String(route.params.versionGuid) !== guid) return false
  if (result) version.value = result
  clearTimeout(timer)
  if (result?.status === 'finalizing' && !result.finalization_error_code && globalThis.document.visibilityState === 'visible' && polls < 30)
    timer = setTimeout(() => { polls++; void load() }, 5000)
  return !!result
}
watch(() => [route.params.versionGuid, auth.user?.guid], () => { version.value = undefined; polls = 0; clearTimeout(timer); void load() })
onMounted(load)
onUnmounted(() => { active = false; request++; clearTimeout(timer) })
</script>
<template>
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <RouterLink :to="`/documents/${route.params.documentGuid}`" class="text-xs text-primary underline">← {{ t('Detail') }}</RouterLink>
      <h1 class="mt-3 text-2xl font-semibold wrap-anywhere">{{ version?.document_title || t('Baca dokumen') }}</h1>
      <p class="mt-2 text-xs text-muted">{{ t('Versi :number · :description', { number: version ? formatNumber(version.version_number) : '', description: version?.status === 'completed' ? t('PDF final dari server') : t('Pratinjau versi ini') }) }}</p>
    </div>
    <StatusBadge v-if="version" :status="version.status" />
  </div>
  <FeedbackMessage :message="t(error)" error />
  <button class="mb-4 min-h-11 text-sm text-primary underline" :disabled="busy" @click="load">{{ t('Periksa status') }}</button>
  <p v-if="busy && !version" role="status">{{ t('Memuat metadata…') }}</p>
  <p v-if="version?.status === 'finalizing' && canView && version.preview_status === 'ready'" class="mb-4 rounded-xl border border-line bg-white p-4 text-sm">{{ t('PDF final sedang disiapkan. PDF di bawah ini adalah pratinjau versi yang ditandatangani.') }}</p>
  <p v-if="version?.status === 'revision_requested' || version?.status === 'superseded'" class="mb-4 rounded-xl border border-line bg-white p-4 text-sm">{{ t('Versi ini dihentikan untuk revisi. Tindakan lama tidak berlaku pada draft baru.') }}</p>
  <p v-if="assignment?.status === 'waiting'" class="rounded-xl border border-line bg-white p-6">{{ t('Menunggu giliran. PDF, posisi, konfirmasi baca, dan tanda tangan belum tersedia.') }}</p>
  <SigningSession v-else-if="version && canView && (version.preview_status === 'ready' || version.status === 'completed')"
    :key="`${version.guid}:${version.content_hash}:${version.status}`" :version-guid="version.guid"
    :title="version.document_title || t('Dokumen')" :version-number="version.version_number"
    :assignment="assignment" :expected-hash="version.content_hash" :owner="owner"
    :status="version.status" :is-current="version.is_current" :refresh="load" />
  <p v-else-if="version" class="rounded-xl border border-line bg-white p-6">{{ t('PDF belum dapat dibuka untuk versi atau giliran ini.') }}</p>
</template>

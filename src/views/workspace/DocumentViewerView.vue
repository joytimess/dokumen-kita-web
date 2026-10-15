<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { documentsApi } from '../../services/documents.service'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import { ownAssignment } from '../../utils/documents'
import type { DocumentRecord } from '../../types/documents'
import SigningSession from '../../components/signatures/SigningSession.vue'
import StatusBadge from '../../components/documents/StatusBadge.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
const route = useRoute(),
  auth = useAuthStore(),
  document = ref<DocumentRecord>()
const { busy, error, run } = useWorkspaceRequest()
const owner = computed(() => document.value?.owner_guid === auth.user?.guid)
const assignment = computed(() =>
  document.value && auth.user ? ownAssignment(document.value, auth.user) : undefined,
)
const matching = computed(() => document.value?.current_version.guid === route.params.versionGuid)
const canView = computed(
  () =>
    matching.value &&
    (owner.value ||
      (assignment.value &&
        ['ready', 'signed', 'revision_requested', 'rejected'].includes(assignment.value.status))),
)
async function load() {
  const result = await run(() => documentsApi.detail(String(route.params.documentGuid)))
  if (result) document.value = result
}
onMounted(load)
</script>
<template>
  <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
    <div>
      <RouterLink
        :to="`/documents/${route.params.documentGuid}`"
        class="text-xs text-primary underline"
        >← Detail</RouterLink
      >
      <h1 class="mt-3 text-2xl font-semibold wrap-anywhere">
        {{ document?.title || 'Baca dokumen' }}
      </h1>
      <p class="mt-2 text-xs text-muted">
        {{
          document?.current_version.status === 'completed'
            ? 'PDF final dari server'
            : 'Snapshot / preview · bukan PDF final bertanda tangan'
        }}
      </p>
    </div>
    <StatusBadge v-if="document" :status="document.current_version.status" />
  </div>
  <FeedbackMessage :message="error" error /><button
    class="mb-4 min-h-11 text-sm text-primary underline"
    :disabled="busy"
    @click="load"
  >
    Periksa status
  </button>
  <p v-if="busy && !document" role="status">Memuat metadata…</p>
  <SigningSession
    v-if="document && canView"
    :key="`${document.current_version.guid}:${document.current_version.content_hash}`"
    :version-guid="document.current_version.guid"
    :title="document.title"
    :version-number="document.current_version.version_number"
    :assignment="assignment"
    :expected-hash="document.current_version.content_hash"
    :owner="owner"
    :status="document.current_version.status"
    :refresh="load"
  />
  <div v-else-if="document" class="rounded-xl border border-line bg-white p-6">
    <p class="text-sm">
      {{
        !matching
          ? 'Metadata versi historis belum disediakan melalui detail ini. Viewer tidak dibuka menggunakan metadata versi lain.'
          : 'PDF belum dapat dibuka untuk giliran Anda.'
      }}
    </p>
  </div>
  <p v-if="document?.current_version.status === 'finalizing'" class="mt-5 text-sm text-muted">
    Semua persetujuan diterima. Backend belum menyediakan proses pembuatan PDF final; tidak ada
    estimasi penyelesaian otomatis.
  </p>
</template>

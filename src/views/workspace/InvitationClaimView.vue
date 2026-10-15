<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { documentsApi } from '../../services/documents.service'
import { pendingInvitation, clearInvitation } from '../../utils/invitation'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import type { Assignment } from '../../types/documents'
import StatusBadge from '../../components/documents/StatusBadge.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
const token = ref(pendingInvitation()),
  assignment = ref<Assignment>()
const router = useRouter()
const { busy, error, run } = useWorkspaceRequest()
async function claim() {
  if (!token.value || assignment.value) return
  const result = await run(() => documentsApi.claim(token.value))
  if (result) {
    assignment.value = result
    clearInvitation()
    token.value = ''
    if (result.document_guid) await router.replace(`/documents/${result.document_guid}/versions/${result.version_guid}/view`)
  }
}
</script>
<template>
  <div class="mb-7">
    <p class="mb-3 text-xs font-semibold tracking-widest text-primary">UNDANGAN</p>
    <h1 class="text-3xl font-semibold">Lanjutkan kesepakatan.</h1>
    <p class="mt-3 text-sm text-muted">
      Undangan hanya dapat diklaim oleh akun terverifikasi dengan email penerima yang sesuai.
    </p>
  </div>
  <FeedbackMessage :message="error" error />
  <section v-if="!assignment" class="max-w-2xl rounded-xl border border-line bg-white p-6">
    <p v-if="!token" class="text-sm text-muted">
      Buka tautan undangan asli dari email untuk mengklaim dokumen.
    </p>
    <template v-else
      ><p class="mb-5 text-sm">
        Klaim undangan dengan akun yang sedang masuk untuk memeriksa giliran Anda.
      </p>
      <BaseButton :loading="busy" @click="claim">Klaim undangan</BaseButton></template
    >
  </section>
  <template v-else
    ><StatusBadge :status="assignment.status" />
    <p class="my-4 text-sm wrap-anywhere">
      {{ assignment.recipient_email }} · Urutan {{ assignment.sequence_number }}
    </p>
    <div
      v-if="assignment.status === 'waiting'"
      class="max-w-2xl rounded-xl border border-line bg-white p-6"
    >
      <p class="text-sm">Menunggu giliran. PDF dan placeholder tidak dimuat.</p>
      <RouterLink v-if="assignment.document_guid" :to="`/documents/${assignment.document_guid}/versions/${assignment.version_guid}/view`" class="mt-3 inline-block text-primary underline">Periksa status versi</RouterLink>
    </div>
    <RouterLink v-else-if="assignment.document_guid" :to="`/documents/${assignment.document_guid}/versions/${assignment.version_guid}/view`" class="text-primary underline">Buka dokumen</RouterLink></template
  >
</template>

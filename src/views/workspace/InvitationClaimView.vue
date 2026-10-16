<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { documentsApi } from '../../services/documents.service'
import { pendingInvitation, clearInvitation } from '../../utils/invitation'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import { confirmAction, notify } from '../../services/feedback'
import type { Assignment } from '../../types/documents'
import StatusBadge from '../../components/documents/StatusBadge.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
import { formatNumber, t } from '../../services/workspace-language'
const token = ref(pendingInvitation()),
  assignment = ref<Assignment>()
const router = useRouter()
const { busy, error, run } = useWorkspaceRequest()
async function claim() {
  if (!token.value || assignment.value) return
  if (!(await confirmAction(t('Klaim undangan ini dengan akun yang sedang masuk?'), {
    title: t('Klaim undangan'), action: t('Klaim'),
  }))) return
  const result = await run(() => documentsApi.claim(token.value))
  if (result) {
    assignment.value = result
    clearInvitation()
    token.value = ''
    notify.success('Undangan berhasil diklaim.')
    if (result.document_guid) await router.replace(`/documents/${result.document_guid}/versions/${result.version_guid}/view`)
  }
}
</script>
<template>
  <div class="mb-7">
    <p class="mb-3 text-xs font-semibold tracking-widest text-primary">{{ t('Undangan') }}</p>
    <h1 class="text-3xl font-semibold">{{ t('Lanjutkan kesepakatan.') }}</h1>
    <p class="mt-3 text-sm text-muted">
      {{ t('Undangan hanya dapat diklaim oleh akun terverifikasi dengan email penerima yang sesuai.') }}
    </p>
  </div>
  <FeedbackMessage :message="t(error)" error />
  <section v-if="!assignment" class="max-w-2xl rounded-xl border border-line bg-white p-6">
    <p v-if="!token" class="text-sm text-muted">
      {{ t('Buka tautan undangan asli dari email untuk mengklaim dokumen.') }}
    </p>
    <template v-else
      ><p class="mb-5 text-sm">
        {{ t('Klaim undangan dengan akun yang sedang masuk untuk memeriksa giliran Anda.') }}
      </p>
      <BaseButton :loading="busy" @click="claim">{{ t('Klaim undangan') }}</BaseButton></template
    >
  </section>
  <template v-else
    ><StatusBadge :status="assignment.status" />
    <p class="my-4 text-sm wrap-anywhere">
      {{ assignment.recipient_email }} · {{ t('Urutan :number', { number: formatNumber(assignment.sequence_number) }) }}
    </p>
    <div
      v-if="assignment.status === 'waiting'"
      class="max-w-2xl rounded-xl border border-line bg-white p-6"
    >
      <p class="text-sm">{{ t('Menunggu giliran. PDF dan placeholder tidak dimuat.') }}</p>
      <RouterLink v-if="assignment.document_guid" :to="`/documents/${assignment.document_guid}/versions/${assignment.version_guid}/view`" class="mt-3 inline-block text-primary underline">{{ t('Periksa status versi') }}</RouterLink>
    </div>
    <RouterLink v-else-if="assignment.document_guid" :to="`/documents/${assignment.document_guid}/versions/${assignment.version_guid}/view`" class="text-primary underline">{{ t('Buka dokumen') }}</RouterLink></template
  >
</template>

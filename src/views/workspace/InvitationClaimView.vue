<script setup lang="ts">
import { ref } from 'vue'
import { documentsApi } from '../../services/documents.service'
import { pendingInvitation, clearInvitation } from '../../utils/invitation'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import type { Assignment } from '../../types/documents'
import SigningSession from '../../components/signatures/SigningSession.vue'
import StatusBadge from '../../components/documents/StatusBadge.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
const token = ref(pendingInvitation()),
  assignment = ref<Assignment>()
const { busy, error, run } = useWorkspaceRequest()
async function claim() {
  if (!token.value || assignment.value) return
  const result = await run(() => documentsApi.claim(token.value))
  if (result) {
    assignment.value = result
    clearInvitation()
    token.value = ''
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
      Buka tautan undangan asli dari email. Konteks undangan yang sudah diklaim tidak
      dipersistenkan. Backend belum menyediakan GUID dokumen atau endpoint untuk memulihkan detail
      dari assignment setelah refresh.
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
      <p class="mt-3 text-xs text-muted">
        Pemeriksaan status setelah klaim terblokir kontrak: respons tidak memuat GUID dokumen dan
        belum ada endpoint detail assignment. Buka ulang tautan undangan asli untuk melakukan klaim
        idempoten dan memeriksa giliran selama undangan aktif.
      </p>
    </div>
    <SigningSession
      v-else-if="assignment.status === 'ready'"
      :version-guid="assignment.version_guid"
      title="Dokumen undangan"
      :context-complete="false"
      :assignment="assignment"
      status="in_progress"
    />
    <p class="mt-5 text-xs text-muted">
      Judul, nomor versi, dan navigasi detail belum tersedia pada respons klaim. Data tersebut tidak
      ditebak dari token. Simpan tautan asli di email untuk membuka undangan kembali.
    </p></template
  >
</template>

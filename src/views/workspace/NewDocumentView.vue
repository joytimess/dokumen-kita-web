<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import BaseButton from '../../components/ui/BaseButton.vue'
import FormField from '../../components/ui/FormField.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
const title = ref(''),
  attempted = ref(false)
const router = useRouter()
const { busy, error, fields, run } = useWorkspaceRequest()
async function submit() {
  if (!title.value.trim() || attempted.value) return
  attempted.value = true
  const document = await run(async () => {
    try {
      return await documentsApi.create(title.value.trim())
    } catch (cause) {
      if (!workspaceError(cause).ambiguous) attempted.value = false
      throw cause
    }
  })
  if (document) await router.replace(`/documents/${document.guid}/edit`)
}
</script>
<template>
  <div class="max-w-2xl">
    <p class="mb-3 text-xs font-semibold tracking-widest text-primary">DRAFT BARU</p>
    <h1 class="mb-3 text-3xl font-semibold">Beri ruang untuk kesepakatan.</h1>
    <p class="mb-8 text-sm text-muted">
      Mulai dengan judul. Isi dan penerima dapat Anda siapkan setelah draft dibuat.
    </p>
    <FeedbackMessage :message="error" error />
    <form class="rounded-xl border border-line bg-white p-5 sm:p-8" @submit.prevent="submit">
      <FormField
        id="document-title"
        v-model="title"
        label="Judul dokumen"
        :maxlength="255"
        :error="fields.title"
        :disabled="busy || attempted"
      /><BaseButton type="submit" :loading="busy" :disabled="!title.trim() || attempted"
        >Buat draft</BaseButton
      >
    </form>
    <p v-if="attempted && error" class="mt-5 text-sm text-muted">
      Periksa
      <RouterLink to="/documents" class="text-primary underline">Dokumen Saya</RouterLink> sebelum
      membuat ulang; hasil permintaan sebelumnya mungkin sudah tersimpan.
    </p>
  </div>
</template>

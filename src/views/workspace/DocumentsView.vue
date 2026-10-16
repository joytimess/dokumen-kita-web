<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import { useAuthStore } from '../../stores/auth'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import { confirmAction, notify } from '../../services/feedback'
import type { DocumentRecord, Page } from '../../types/documents'
import { dateLabel } from '../../utils/documents'
import StatusBadge from '../../components/documents/StatusBadge.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
import FormField from '../../components/ui/FormField.vue'
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore()
const summary = computed(() => route.path === '/dashboard')
const page = ref<Page<DocumentRecord>>()
const status = ref('')
const query = ref('')
const draftDialog = ref<HTMLDialogElement>()
const title = ref('')
const attempted = ref(false)
const { busy, error, run } = useWorkspaceRequest()
const { busy: creating, error: createError, fields: createFields, run: createRun } = useWorkspaceRequest()
const visible = computed(() =>
  (page.value?.data ?? []).filter((d) => d.title.toLowerCase().includes(query.value.toLowerCase())),
)
async function load(number = 1) {
  const result = await run(() => documentsApi.list(number, status.value))
  if (result) page.value = result
}
watch(status, () => {
  void load()
})
async function createDraft() {
  if (!title.value.trim() || attempted.value || creating.value) return
  if (!(await confirmAction(`Buat draft “${title.value.trim()}”?`, {
    title: 'Buat dokumen', action: 'Buat draft',
  }))) return
  const document = await createRun(async () => {
    attempted.value = true
    try {
      return await documentsApi.create(title.value.trim())
    } catch (cause) {
      if (!workspaceError(cause).ambiguous) attempted.value = false
      throw cause
    }
  })
  if (document) {
    notify.success('Draft berhasil dibuat.')
    await router.push(`/documents/${document.guid}/edit`)
  }
}
onMounted(() => load())
</script>
<template>
  <div class="mb-8 flex flex-wrap items-start justify-between gap-4">
    <div>
      <p class="mb-2 text-xs font-semibold tracking-widest text-primary">RUANG DOKUMEN ANDA</p>
      <h1 class="text-3xl font-semibold">
        {{ summary ? `Selamat datang, ${auth.user?.name}.` : 'Dokumen Saya' }}
      </h1>
      <p class="mt-3 text-sm text-muted">
        {{
          summary
            ? 'Lanjutkan dokumen terbaru Anda atau mulai satu draft baru.'
            : 'Kelola dokumen milik Anda dan ikuti statusnya.'
        }}
      </p>
    </div>
    <BaseButton @click="draftDialog?.showModal()">+ Buat Dokumen</BaseButton>
  </div>
  <dialog
    ref="draftDialog"
    aria-labelledby="draft-title"
    aria-describedby="draft-description"
    class="draft-dialog fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl"
    @cancel="creating && $event.preventDefault()"
  >
    <form @submit.prevent="createDraft">
      <div class="border-b border-line px-6 pt-6 pb-5 sm:px-8 sm:pt-8">
        <p class="text-xs font-semibold tracking-widest text-primary">DRAFT BARU</p>
        <h2 id="draft-title" class="mt-2 text-2xl font-semibold">Buat dokumen baru</h2>
        <p id="draft-description" class="mt-2 text-sm leading-6 text-muted">
          Mulai dengan judul. Isi dan penerima disiapkan setelah draft dibuat.
        </p>
      </div>
      <div class="px-6 pt-6 pb-2 sm:px-8">
        <FeedbackMessage :message="createError" error />
        <FormField
          id="document-title"
          v-model="title"
          label="Judul dokumen"
          :maxlength="255"
          :error="createFields.title"
          :disabled="creating || attempted"
        />
        <p v-if="attempted && createError" class="pb-4 text-sm text-muted">
          Hasil permintaan belum pasti. Periksa daftar dokumen sebelum memuat ulang halaman untuk mencoba lagi.
        </p>
      </div>
      <div class="flex flex-wrap justify-end gap-3 border-t border-line bg-soft px-6 py-4 sm:px-8">
        <button
          type="button"
          class="min-h-12 rounded-lg border border-line bg-white px-5 text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-sage disabled:opacity-50 motion-reduce:transition-none"
          :disabled="creating"
          @click="draftDialog?.close()"
        >Batal</button>
        <button
          type="submit"
          class="min-h-12 rounded-lg border border-primary bg-primary px-6 py-3 text-sm font-semibold text-white enabled:hover:bg-[#174c39] disabled:cursor-not-allowed! disabled:opacity-65"
          :disabled="!title.trim() || attempted || creating"
        >Buat draft</button>
      </div>
    </form>
  </dialog>
  <FeedbackMessage :message="error" error /><button
    v-if="error"
    class="mb-4 min-h-11 text-primary underline"
    @click="load()"
  >
    Coba lagi
  </button>
  <div v-if="!summary" class="mb-5 flex flex-wrap gap-4">
    <label class="grid min-w-0 flex-1 gap-2 text-xs"
      >Cari pada halaman yang dimuat<input
        v-model="query"
        type="search"
        class="min-h-11 rounded-lg border border-line bg-white px-3"
        placeholder="Cari judul di halaman ini" /></label
    ><label class="grid gap-2 text-xs"
      >Status<select v-model="status" class="min-h-11 rounded-lg border border-line bg-white px-3">
        <option value="">Semua status</option>
        <option value="draft">Draft</option>
        <option value="in_progress">Dalam proses</option>
        <option value="finalizing">Menyiapkan final</option>
        <option value="completed">Selesai</option>
      </select></label
    >
  </div>
  <p v-if="busy" role="status" class="py-10 text-sm text-muted">Memuat dokumen…</p>
  <div
    v-else-if="page && !page.data.length"
    class="rounded-xl border border-dashed border-line bg-white px-6 py-16 text-center"
  >
    <h2 class="text-xl font-semibold">
      {{ status ? 'Belum ada dokumen dengan status ini.' : 'Mulai dari satu dokumen.' }}
    </h2>
    <p class="mt-3 text-sm text-muted">Draft yang Anda buat akan tampil di sini.</p>
  </div>
  <div v-else class="grid gap-3">
    <RouterLink
      v-for="document in visible"
      :key="document.guid"
      :to="`/documents/${document.guid}`"
      class="flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white p-5 transition-colors hover:border-primary motion-reduce:transition-none"
      ><div class="min-w-0">
        <h2 class="font-semibold wrap-anywhere">{{ document.title }}</h2>
        <p class="mt-2 text-xs text-muted">
          Versi {{ document.current_version.version_number }} · Diperbarui
          {{ dateLabel(document.updated_at) }}
        </p>
      </div>
      <StatusBadge :status="document.current_version.status"
    /></RouterLink>
    <p v-if="page?.data.length && !visible.length" class="p-6 text-sm text-muted">
      Tidak ada judul yang cocok pada halaman ini.
    </p>
  </div>
  <nav
    v-if="page && page.meta.last_page > 1"
    class="mt-6 flex flex-wrap items-center gap-4 text-sm"
    aria-label="Halaman dokumen"
  >
    <button
      class="min-h-11 text-primary disabled:opacity-40"
      :disabled="busy || !page.links.prev"
      @click="load(page.meta.current_page - 1)"
    >
      ← Sebelumnya</button
    ><span>Halaman {{ page.meta.current_page }} dari {{ page.meta.last_page }}</span
    ><button
      class="min-h-11 text-primary disabled:opacity-40"
      :disabled="busy || !page.links.next"
      @click="load(page.meta.current_page + 1)"
    >
      Berikutnya →
    </button>
  </nav>
  <p v-if="summary" class="mt-6 text-xs text-muted">
    Menampilkan halaman terbaru dari dokumen milik Anda.
    <RouterLink to="/documents" class="text-primary underline">Buka Dokumen Saya</RouterLink>
  </p>
</template>

<style scoped>
.draft-dialog {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
  transition:
    opacity 180ms ease-in,
    transform 180ms ease-in,
    display 180ms allow-discrete,
    overlay 180ms allow-discrete;
}

.draft-dialog[open] {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition-timing-function: ease-out;
}

@starting-style {
  .draft-dialog[open] {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
}

.draft-dialog::backdrop {
  background-color: rgb(8 29 21 / 0%);
  transition:
    background-color 180ms ease-in,
    display 180ms allow-discrete,
    overlay 180ms allow-discrete;
}

.draft-dialog[open]::backdrop {
  background-color: rgb(8 29 21 / 40%);
  transition-timing-function: ease-out;
}

@starting-style {
  .draft-dialog[open]::backdrop {
    background-color: rgb(8 29 21 / 0%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .draft-dialog,
  .draft-dialog::backdrop {
    transition: none;
  }
  .draft-dialog { transform: none; }
}
</style>

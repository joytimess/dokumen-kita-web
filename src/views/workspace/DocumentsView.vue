<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { documentsApi } from '../../services/documents.service'
import { useAuthStore } from '../../stores/auth'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import type { DocumentRecord, Page } from '../../types/documents'
import { dateLabel } from '../../utils/documents'
import StatusBadge from '../../components/documents/StatusBadge.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
const route = useRoute(),
  auth = useAuthStore()
const summary = computed(() => route.path === '/dashboard')
const page = ref<Page<DocumentRecord>>()
const status = ref('')
const query = ref('')
const { busy, error, run } = useWorkspaceRequest()
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
    <RouterLink
      to="/documents/new"
      class="inline-flex min-h-12 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-white"
      >+ Buat dokumen</RouterLink
    >
  </div>
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

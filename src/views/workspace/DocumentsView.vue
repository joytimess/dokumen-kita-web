<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { documentsApi } from '../../services/documents.service'
import { categoriesApi } from '../../services/categories.service'
import { workspaceError } from '../../services/workspace.errors'
import { notify } from '../../services/feedback'
import { useAuthStore } from '../../stores/auth'
import { dateLabel } from '../../utils/documents'
import { categoryColorClass } from '../../utils/category'
import type { DocumentCategory, DocumentRecord, Page } from '../../types/documents'
import StatusBadge from '../../components/documents/StatusBadge.vue'
import CreateDocumentButton from '../../components/documents/CreateDocumentButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
import SelectControl from '../../components/ui/SelectControl.vue'
import { formatNumber, language, t } from '../../services/workspace-language'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const summary = computed(() => route.path === '/dashboard')
const page = ref<Page<DocumentRecord>>()
const status = ref('')
const perPage = ref(10)
const query = ref('')
const categoryFilter = ref('')
const sort = ref<'created' | 'title'>('created')
const categories = ref<DocumentCategory[]>([])
const categoryError = ref('')
const listLoading = ref(false)
const listError = ref('')
const pageMatchesFilters = ref(false)
const actionError = ref('')
const openActions = ref('')
const counts = ref<Record<string, number | undefined>>({})
const countsLoading = ref(false)
const countError = ref(false)
const downloading = ref('')
const selectedGuids = ref<string[]>([])
const bulkCategory = ref('')
const bulkBusy = ref(false)
let listRequest = 0
let countRequest = 0
let active = true
let queryTimer: ReturnType<typeof setTimeout> | undefined
const statuses = ['draft', 'in_progress', 'completed', 'finalizing']
const categoryFilterOptions = computed(() => [
  { value: '', label: t('Semua kategori') },
  { value: '__uncategorized', label: t('Tanpa kategori') },
  ...categories.value.map(({ guid, name }) => ({ value: guid, label: name })),
])
const bulkCategoryOptions = computed(() => [
  { value: '', label: t('Pilih tindakan') },
  { value: '__none__', label: t('Tanpa kategori') },
  ...categories.value.map(({ guid, name }) => ({ value: guid, label: name })),
])
const visible = computed(() => {
  const rows = [...(page.value?.data ?? [])]
  return sort.value === 'title'
    ? rows.sort((a, b) => a.title.localeCompare(b.title, language.value === 'en' ? 'en' : 'id'))
    : rows
})
const showingStart = computed(() => {
  const meta = page.value?.meta
  return meta?.total ? (meta.current_page - 1) * meta.per_page + 1 : 0
})
const showingEnd = computed(() => {
  const meta = page.value?.meta
  return meta ? Math.min(meta.current_page * meta.per_page, meta.total) : 0
})
const numberLabel = formatNumber
const tabs = computed(() => [
  { id: '', label: t('Semua'), total: counts.value.all },
  { id: 'draft', label: t('Draft'), total: counts.value.draft },
  { id: 'in_progress', label: t('Dalam proses'), total: counts.value.in_progress },
  { id: 'completed', label: t('Selesai'), total: counts.value.completed },
])
const stats = computed(() => [
  { status: 'draft', label: t('Draft'), detail: t('Dokumen draft milik Anda.'), icon: 'edit_document' },
  { status: 'in_progress', label: t('Dalam proses'), detail: t('Dokumen yang sedang dalam proses tanda tangan.'), icon: 'draw' },
  { status: 'completed', label: t('Selesai'), detail: t('Dokumen yang selesai diproses.'), icon: 'task_alt' },
  { status: 'finalizing', label: t('Finalisasi'), detail: t('Dokumen sedang menyiapkan hasil final.'), icon: 'hourglass_top' },
])

function queryValue(key: string) {
  const value = route.query[key]
  return typeof value === 'string' ? value : ''
}

async function loadList(number = 1) {
  const request = ++listRequest
  const identity = auth.user?.guid
  const queryText = queryValue('q')
  const statusFilter = queryValue('status')
  const categoryGuid = queryValue('category_guid')
  const uncategorized = queryValue('uncategorized') === '1'
  const perPageFilter = Number(queryValue('per_page')) || 10
  listLoading.value = true
  pageMatchesFilters.value = false
  listError.value = ''
  openActions.value = ''
  try {
    const result = await documentsApi.list({
      page: number,
      status: statusFilter,
      perPage: perPageFilter,
      q: queryText,
      categoryGuid,
      uncategorized,
    })
    if (!active || request !== listRequest || auth.user?.guid !== identity) return
    page.value = result
    pageMatchesFilters.value = true
  } catch (cause) {
    if (!active || request !== listRequest || auth.user?.guid !== identity) return
    listError.value = t(workspaceError(cause).message)
    if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
  } finally {
    if (active && request === listRequest) listLoading.value = false
  }
}

async function loadCategories() {
  const identity = auth.user?.guid
  try {
    const result = await categoriesApi.list()
    if (!active || auth.user?.guid !== identity) return
    categories.value = result
    categoryError.value = ''
  } catch (cause) {
    if (!active || auth.user?.guid !== identity) return
    categoryError.value = t(workspaceError(cause).message)
    if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
  }
}

async function loadCounts() {
  if (countsLoading.value) return
  const request = ++countRequest
  const identity = auth.user?.guid
  countsLoading.value = true
  countError.value = false
  counts.value = {}
  await Promise.all(['', ...statuses].map(async (value) => {
    try {
      const result = await documentsApi.count(value)
      if (!active || request !== countRequest || auth.user?.guid !== identity) return
      counts.value[value || 'all'] = result.meta.total
    } catch (cause) {
      if (!active || request !== countRequest || auth.user?.guid !== identity) return
      countError.value = true
      if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
    }
  }))
  if (active && request === countRequest) countsLoading.value = false
}

function queryChanged() {
  clearTimeout(queryTimer)
  queryTimer = setTimeout(() => {
    void router.replace({ query: { ...route.query, q: query.value.trim() || undefined, page: undefined } })
  }, 400)
}

function filtersChanged() {
  clearTimeout(queryTimer)
  const categoryGuid = categoryFilter.value !== '__uncategorized' ? categoryFilter.value : ''
  void router.replace({ query: {
    ...route.query,
    q: query.value.trim() || undefined,
    status: status.value || undefined,
    category_guid: categoryGuid || undefined,
    uncategorized: categoryFilter.value === '__uncategorized' ? '1' : undefined,
    per_page: perPage.value === 10 ? undefined : String(perPage.value),
    page: undefined,
  } })
}

function chooseStatus(value: string) {
  if (status.value === value) return
  status.value = value
  filtersChanged()
}

function toggleActions(guid: string) {
  openActions.value = openActions.value === guid ? '' : guid
}

function pageTo(number: number) {
  clearTimeout(queryTimer)
  void router.replace({ query: { ...route.query, q: query.value.trim() || undefined, page: number > 1 ? String(number) : undefined } })
}

function retryList() {
  void loadList(Math.max(1, Number(queryValue('page')) || 1))
}

function toggleSelection(guid: string, selected: boolean) {
  selectedGuids.value = selected
    ? [...new Set([...selectedGuids.value, guid])]
    : selectedGuids.value.filter((value) => value !== guid)
}

function selectionChanged(guid: string, event: Event) {
  toggleSelection(guid, (event.target as HTMLInputElement).checked)
}

async function applyCategory() {
  if (bulkBusy.value || !selectedGuids.value.length || !bulkCategory.value) return
  const selected = [...selectedGuids.value]
  const target = bulkCategory.value === '__none__' ? null : bulkCategory.value
  bulkBusy.value = true
  actionError.value = ''
  try {
    const result = await documentsApi.bulkAssignCategory(selected, target)
    selectedGuids.value = []
    notify.success(t('Kategori diperbarui untuk :count dokumen.', { count: result.updated_count }))
    await loadList(page.value?.meta.current_page ?? 1)
  } catch (cause) {
    actionError.value = t(workspaceError(cause).message)
    await loadList(page.value?.meta.current_page ?? 1)
    actionError.value = t(workspaceError(cause).message)
  } finally {
    bulkBusy.value = false
  }
}

async function download(document: DocumentRecord) {
  if (downloading.value) return
  const identity = auth.user?.guid
  downloading.value = document.guid
  actionError.value = ''
  try {
    const { data } = await documentsApi.pdf(document.current_version.guid)
    if (!active || auth.user?.guid !== identity) return
    const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${document.guid}.pdf`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (cause) {
    if (!active || auth.user?.guid !== identity) return
    actionError.value = t(workspaceError(cause).message)
    if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
  } finally {
    downloading.value = ''
  }
}

watch(() => route.fullPath, () => {
  clearTimeout(queryTimer)
  query.value = queryValue('q')
  status.value = queryValue('status')
  categoryFilter.value = queryValue('uncategorized') === '1' ? '__uncategorized' : queryValue('category_guid')
  perPage.value = [10, 25, 50].includes(Number(queryValue('per_page'))) ? Number(queryValue('per_page')) : 10
  selectedGuids.value = []
  actionError.value = ''
  const number = Math.max(1, Number(queryValue('page')) || 1)
  void loadList(number)
}, { immediate: true })
watch(() => route.path, (path) => {
  if (path === '/dashboard') void loadCounts()
})

onMounted(() => {
  void loadCategories()
  if (summary.value) void loadCounts()
})
onUnmounted(() => {
  active = false
  clearTimeout(queryTimer)
  listRequest++
  countRequest++
})
</script>

<template>
  <div v-if="summary" class="mb-8 flex flex-wrap items-end justify-between gap-5">
    <div class="min-w-0">
      <p class="mb-2 text-xs font-semibold tracking-[0.16em] text-primary">{{ t('Ruang dokumen Anda') }}</p>
      <h1 class="text-3xl font-semibold sm:text-[32px]">{{ t('Selamat datang, :name.', { name: auth.user?.name ?? '' }) }}</h1>
      <p class="mt-3 max-w-2xl text-sm text-muted">{{ t('Lanjutkan dokumen terbaru Anda atau mulai satu draft baru.') }}</p>
    </div>
    <CreateDocumentButton />
  </div>
  <div v-else class="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="mb-2 text-xs font-semibold tracking-[0.16em] text-primary">{{ t('Ruang dokumen Anda') }}</p>
      <h1 class="text-3xl font-semibold">{{ t('Dokumen Saya') }}</h1>
      <p class="mt-3 text-sm text-muted">{{ t('Kelola dokumen milik Anda dan ikuti statusnya.') }}</p>
    </div>
    <CreateDocumentButton />
  </div>

  <section v-if="summary" :aria-label="t('Ringkasan dokumen')" class="mb-8">
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <button
        v-for="stat in stats"
        :key="stat.status"
        type="button"
        class="min-h-36 rounded-2xl border border-line bg-white p-5 text-left shadow-[0_2px_10px_rgba(20,28,48,0.035)] transition-colors hover:border-primary/50 hover:bg-[#fcfdfc]"
        :class="status === stat.status && 'border-primary ring-1 ring-primary/20'"
        :aria-pressed="status === stat.status"
        @click="chooseStatus(stat.status)"
      >
        <span class="flex items-center justify-between text-sm font-semibold text-muted">
          {{ stat.label }}
          <span class="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">{{ stat.icon }}</span>
        </span>
        <strong v-if="counts[stat.status] !== undefined" class="mt-3 block text-3xl font-semibold text-ink">{{ numberLabel(counts[stat.status]!) }}</strong>
        <span v-else-if="countsLoading" class="mt-4 block h-7 w-20 animate-pulse rounded bg-sage motion-reduce:animate-none" :aria-label="t('Memuat statistik')"></span>
        <span v-else class="mt-3 block text-sm font-medium text-error">{{ t('Belum tersedia') }}</span>
        <span class="mt-1 block text-xs leading-5 text-muted">{{ stat.detail }}</span>
      </button>
    </div>
    <div v-if="countError" class="mt-3 flex items-center justify-between gap-4 text-sm text-muted">
      <span>{{ t('Sebagian statistik belum dapat dimuat.') }}</span>
      <button type="button" class="min-h-11 font-semibold text-primary underline" :disabled="countsLoading" @click="loadCounts">{{ t('Muat ulang statistik') }}</button>
    </div>
  </section>

  <section class="rounded-2xl border border-line bg-white p-4 shadow-[0_2px_10px_rgba(20,28,48,0.035)] sm:p-6">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-4">
      <h2 class="text-xl font-semibold">{{ summary ? t('Dokumen terbaru') : t('Daftar dokumen') }}</h2>
      <div v-if="summary" role="group" :aria-label="t('Filter dokumen')" class="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-soft p-1">
        <button
          v-for="tab in tabs"
          :key="tab.id || 'all'"
          type="button"
          class="min-h-10 shrink-0 rounded-lg px-3 text-xs font-semibold sm:text-sm"
          :class="status === tab.id ? 'bg-white text-primary shadow-sm' : 'text-muted hover:text-ink'"
          :aria-pressed="status === tab.id"
          @click="chooseStatus(tab.id)"
        >{{ tab.label }}<span v-if="tab.total !== undefined" class="ml-1.5 text-muted">{{ numberLabel(tab.total) }}</span><span v-else-if="countsLoading" class="ml-1.5">…</span></button>
      </div>
    </div>

    <div class="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:items-end">
      <label class="grid min-w-0 gap-2 text-xs font-medium text-muted">
        {{ t('Cari judul dokumen') }}
        <span class="flex min-w-0 gap-2">
          <input v-model="query" type="search" maxlength="200" class="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm text-ink" :placeholder="t('Cari judul dokumen')" @input="queryChanged" />
          <button v-if="query" type="button" class="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm text-primary" :aria-label="t('Hapus pencarian')" @click="query = ''; queryChanged()">{{ t('Bersihkan') }}</button>
        </span>
      </label>
      <div v-if="!summary" class="grid gap-2 text-xs font-medium text-muted">
        {{ t('Status') }}
        <SelectControl
          v-model="status"
          :ariaLabel="t('Status')"
          class="min-h-11 text-sm"
          :options="[
            { value: '', label: t('Semua status') },
            { value: 'draft', label: t('Draft') },
            { value: 'in_progress', label: t('Dalam proses') },
            { value: 'finalizing', label: t('Finalisasi') },
            { value: 'completed', label: t('Selesai') },
          ]"
          @change="filtersChanged"
        />
      </div>
      <div class="grid min-w-0 gap-2 text-xs font-medium text-muted">
        {{ t('Kategori') }}
        <SelectControl v-model="categoryFilter" :ariaLabel="t('Kategori')" class="min-h-11 w-full text-sm" :options="categoryFilterOptions" @change="filtersChanged" />
      </div>
      <div class="grid gap-2 text-xs font-medium text-muted">
        {{ t('Urutkan') }}
        <SelectControl
          v-model="sort"
          :ariaLabel="t('Urutkan')"
          class="min-h-11 text-sm"
          :options="[
            { value: 'created', label: t('Terbaru dibuat') },
            { value: 'title', label: t('Judul A–Z pada halaman ini') },
          ]"
        />
      </div>
    </div>
    <p class="mb-4 text-xs text-muted">{{ t('Pencarian judul berlaku untuk seluruh dokumen milik Anda. Urutan judul hanya berlaku pada halaman yang sedang dibuka.') }}</p>
    <div v-if="categoryError" class="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>{{ t('Kategori belum dapat dimuat.') }}</span>
      <button type="button" class="min-h-10 font-semibold text-primary underline" @click="loadCategories">{{ t('Coba lagi') }}</button>
    </div>
    <section v-if="selectedGuids.length" class="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-sage/60 p-3" :aria-label="t('Tindakan kategori untuk pilihan')">
      <p class="mr-auto self-center text-sm font-medium">{{ t(':count dokumen dipilih pada halaman ini.', { count: selectedGuids.length }) }}</p>
      <div class="grid gap-1 text-xs font-medium text-muted">
        {{ t('Tetapkan kategori') }}
        <SelectControl v-model="bulkCategory" :ariaLabel="t('Tetapkan kategori')" class="min-h-11 min-w-44 text-sm" :options="bulkCategoryOptions" />
      </div>
      <button type="button" class="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50" :disabled="bulkBusy || !bulkCategory" @click="applyCategory">{{ bulkBusy ? t('Menyimpan…') : t('Terapkan') }}</button>
      <button type="button" class="min-h-10 px-3 text-sm font-semibold text-muted underline" :disabled="bulkBusy" @click="selectedGuids = []">{{ t('Batalkan pilihan') }}</button>
      <p class="basis-full text-xs text-muted">{{ t('Pilihan hanya mencakup baris yang dicentang pada halaman ini.') }}</p>
    </section>

    <FeedbackMessage :message="listError || actionError" error />
    <button v-if="listError" type="button" class="mb-4 min-h-11 text-sm font-semibold text-primary underline" @click="retryList">{{ t('Coba lagi') }}</button>
    <p v-if="listError && page && !pageMatchesFilters" class="mb-4 rounded-lg bg-yellow-50 p-3 text-sm text-yellow-900">{{ t('Pencarian atau filter baru gagal dimuat. Data sebelumnya tetap disimpan; belum ada hasil baru untuk ditampilkan.') }}</p>
    <p v-if="listLoading" role="status" class="py-10 text-center text-sm text-muted">{{ t('Memuat dokumen…') }}</p>
    <div v-else-if="page && pageMatchesFilters && !page.meta.total" class="rounded-xl border border-dashed border-line bg-soft/60 px-6 py-12 text-center">
      <h3 class="text-lg font-semibold">{{ query || status || categoryFilter ? t('Tidak ada dokumen yang sesuai.') : t('Belum ada dokumen.') }}</h3>
      <p class="mt-2 text-sm text-muted">{{ query || status || categoryFilter ? t('Coba ubah atau hapus filter yang dipilih.') : t('Draft yang Anda buat akan tampil di sini.') }}</p>
    </div>
    <div v-else-if="page && pageMatchesFilters && !visible.length" class="rounded-xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">
      {{ t('Tidak ada judul yang cocok pada halaman ini.') }}
    </div>
    <div v-else-if="page && pageMatchesFilters" class="divide-y divide-line">
      <article v-for="document in visible" :key="document.guid" class="flex min-w-0 flex-wrap items-center justify-between gap-4 py-4 first:pt-1 last:pb-1">
        <div class="flex min-w-0 flex-1 items-start gap-3">
          <input type="checkbox" class="mt-3 size-4 shrink-0 accent-primary" :checked="selectedGuids.includes(document.guid)" :aria-label="t('Pilih dokumen :title', { title: document.title })" @change="selectionChanged(document.guid, $event)" />
          <span class="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-sage text-primary"><span class="material-symbols-outlined" aria-hidden="true">description</span></span>
          <div class="min-w-0">
            <RouterLink :to="{ path: `/documents/${document.guid}`, query: route.query }" class="block truncate font-semibold text-ink hover:text-primary hover:underline" :title="document.title">{{ document.title }}</RouterLink>
            <p class="mt-1.5 text-xs text-muted">{{ t('Versi :number · Diperbarui :date', { number: numberLabel(document.current_version.version_number), date: dateLabel(document.current_version.updated_at) }) }}</p>
            <span v-if="document.category" class="mt-2 inline-flex max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-medium" :class="categoryColorClass(document.category.color_token)">{{ document.category.name }}</span>
            <span v-else class="mt-2 inline-block text-xs text-muted">{{ t('Tanpa kategori') }}</span>
          </div>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">
          <StatusBadge :status="document.current_version.status" />
          <div class="relative">
            <button type="button" :aria-label="t('Buka tindakan dokumen :title', { title: document.title })" :aria-expanded="openActions === document.guid" :aria-controls="`document-actions-${document.guid}`" class="grid size-10 place-items-center rounded-lg text-muted hover:bg-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" @click="toggleActions(document.guid)">
              <span class="material-symbols-outlined" aria-hidden="true">more_vert</span>
            </button>
            <Transition name="workspace-dropdown">
              <div v-show="openActions === document.guid" :id="`document-actions-${document.guid}`" class="absolute right-0 top-full z-20 mt-1 min-w-44 rounded-xl border border-line bg-white p-1 shadow-xl">
                <RouterLink v-if="document.owner_guid === auth.user?.guid && document.current_version.status === 'draft'" :to="`/documents/${document.guid}/edit`" class="block min-h-10 rounded-lg px-3 py-2 text-sm text-ink hover:bg-soft">{{ t('Edit') }}</RouterLink>
                <button v-if="document.current_version.status === 'completed'" type="button" class="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-soft disabled:opacity-50" :disabled="!!downloading" @click="toggleActions(document.guid); download(document)">
                  {{ t('Unduh PDF') }}
                </button>
                <RouterLink :to="{ path: `/documents/${document.guid}`, query: route.query }" class="block min-h-10 rounded-lg px-3 py-2 text-sm text-ink hover:bg-soft">{{ t('Lihat detail') }}</RouterLink>
              </div>
            </Transition>
          </div>
        </div>
      </article>
    </div>

    <nav v-if="page && pageMatchesFilters" class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm" :aria-label="t('Halaman dokumen')">
      <div class="flex items-center gap-2 text-xs font-medium text-muted">
        {{ t('Tampilkan baris') }}
        <SelectControl
          v-model="perPage"
          :ariaLabel="t('Tampilkan baris')"
          class="h-9 text-sm"
          :options="[
            { value: 10, label: '10' },
            { value: 25, label: '25' },
            { value: 50, label: '50' },
          ]"
          @change="filtersChanged"
        />
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <span class="mr-1 text-xs text-muted">{{ t('Menampilkan :start–:end dari :total', { start: numberLabel(showingStart), end: numberLabel(showingEnd), total: numberLabel(page.meta.total) }) }}</span>
        <button type="button" class="grid size-9 place-items-center rounded-md border border-line bg-white text-ink hover:bg-soft disabled:text-muted disabled:opacity-50" :aria-label="t('Sebelumnya')" :disabled="listLoading || !page.links.prev" @click="pageTo(page.meta.current_page - 1)">
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">chevron_left</span>
        </button>
        <button type="button" class="grid size-9 place-items-center rounded-md border border-line bg-white text-ink hover:bg-soft disabled:text-muted disabled:opacity-50" :aria-label="t('Berikutnya')" :disabled="listLoading || !page.links.next" @click="pageTo(page.meta.current_page + 1)">
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">chevron_right</span>
        </button>
      </div>
    </nav>
  </section>

  <p v-if="summary" class="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
    <span>{{ t('Dokumen milik akun aktif') }}</span>
    <RouterLink to="/documents" class="font-semibold text-primary underline">{{ t('Buka Dokumen Saya') }} →</RouterLink>
  </p>
</template>

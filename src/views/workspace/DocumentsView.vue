<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import 'animate.css'
import { documentsApi } from '../../services/documents.service'
import { categoriesApi } from '../../services/categories.service'
import { workspaceError } from '../../services/workspace.errors'
import { confirmAction, notify } from '../../services/feedback'
import { useAuthStore } from '../../stores/auth'
import { dateLabel } from '../../utils/documents'
import { pdfDownloadFilename } from '../../utils/pdfDownload'
import { categoryColorClass } from '../../utils/category'
import type { DocumentCategory, DocumentRecord, Page } from '../../types/documents'
import StatusBadge from '../../components/documents/StatusBadge.vue'
import CreateDocumentButton from '../../components/documents/CreateDocumentButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
import SelectControl from '../../components/ui/SelectControl.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import { formatNumber, language, t } from '../../services/workspace-language'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const summary = computed(() => route.path === '/dashboard')
const createDocument = ref<InstanceType<typeof CreateDocumentButton>>()
const filterMenu = ref<HTMLDivElement>()
const filterTrigger = ref<HTMLButtonElement>()
const filtersOpen = ref(false)
const page = ref<Page<DocumentRecord>>()
const status = ref('')
const visibility = ref<'active' | 'hidden'>('active')
const perPage = ref(10)
const dashboardPage = ref(1)
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
const visibilityBusy = ref('')
const selectedGuids = ref<string[]>([])
const bulkCategory = ref('')
const bulkBusy = ref(false)
let listRequest = 0
let countRequest = 0
let active = true
let loadedPath = ''
let queryTimer: ReturnType<typeof setTimeout> | undefined
const statuses = ['draft', 'in_progress', 'completed']
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
const visibilityOptions = computed(() => [
  { value: 'active', label: t('Dokumen aktif') },
  { value: 'hidden', label: t('Disembunyikan') },
])
const hasSearchFilters = computed(() => Boolean(query.value || status.value || categoryFilter.value))
const emptyTitle = computed(() =>
  visibility.value === 'hidden' && !hasSearchFilters.value
    ? t('Belum ada dokumen tersembunyi.')
    : hasSearchFilters.value
      ? t('Tidak ada dokumen yang sesuai.')
      : t('Belum ada dokumen.'),
)
const emptyDescription = computed(() =>
  visibility.value === 'hidden' && !hasSearchFilters.value
    ? t('Dokumen yang Anda sembunyikan akan muncul di sini.')
    : hasSearchFilters.value
      ? t('Coba ubah atau hapus filter yang dipilih.')
      : t('Draft yang Anda buat akan tampil di sini.'),
)
const stats = computed(() => [
  { status: '', key: 'all', label: t('Total Dokumen'), icon: 'description' },
  { status: 'draft', key: 'draft', label: t('Draft'), icon: 'edit_document' },
  { status: 'in_progress', key: 'in_progress', label: t('Dalam Proses'), icon: 'draw' },
  { status: 'completed', key: 'completed', label: t('Selesai'), icon: 'task_alt' },
])
const dashboardFilterCount = computed(() =>
  Number(!!status.value) + Number(visibility.value === 'hidden') + Number(!!categoryFilter.value),
)
const hasDashboardFilters = computed(() => hasSearchFilters.value || visibility.value === 'hidden')

function resetDashboardFilters() {
  query.value = ''
  status.value = ''
  categoryFilter.value = ''
  visibility.value = 'active'
  sort.value = 'created'
  filtersChanged()
}

function closeFilters(focus = false) {
  if (!filtersOpen.value) return
  filtersOpen.value = false
  if (focus) filterTrigger.value?.focus()
}

function outsideFilters(event: PointerEvent) {
  if (!filterMenu.value?.contains(event.target as Node)) closeFilters()
}

function queryValue(key: string) {
  const value = route.query[key]
  return typeof value === 'string' ? value : ''
}

function currentPageNumber() {
  return summary.value ? dashboardPage.value : Math.max(1, Number(queryValue('page')) || 1)
}

function loadDashboard(number = 1) {
  dashboardPage.value = number
  selectedGuids.value = []
  actionError.value = ''
  void loadList(number)
}

async function loadList(number = 1) {
  const request = ++listRequest
  const identity = auth.user?.guid
  const queryText = summary.value ? query.value.trim() : queryValue('q')
  const statusFilter = summary.value ? status.value : queryValue('status')
  const visibilityFilter = visibility.value
  const categoryGuid = summary.value ? (categoryFilter.value === '__uncategorized' ? '' : categoryFilter.value) : queryValue('category_guid')
  const uncategorized = summary.value ? categoryFilter.value === '__uncategorized' : queryValue('uncategorized') === '1'
  const perPageFilter = summary.value ? perPage.value : Number(queryValue('per_page')) || 10
  listLoading.value = true
  pageMatchesFilters.value = false
  listError.value = ''
  openActions.value = ''
  try {
    const result = await documentsApi.list({
      page: number,
      status: statusFilter,
      visibility: visibilityFilter,
      perPage: perPageFilter,
      q: queryText,
      categoryGuid,
      uncategorized,
    })
    if (!active || request !== listRequest || auth.user?.guid !== identity) return
    const lastPage = Math.max(1, result.meta.last_page)
    if (number > lastPage) {
      if (summary.value) {
        dashboardPage.value = lastPage
        await loadList(lastPage)
        return
      }
      await router.replace({ query: { ...route.query, page: lastPage > 1 ? String(lastPage) : undefined } })
      return
    }
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
  const request = ++countRequest
  const identity = auth.user?.guid
  const visibilityFilter = visibility.value
  countsLoading.value = true
  countError.value = false
  counts.value = {}
  await Promise.all(['', ...statuses].map(async (value) => {
    try {
      const result = await documentsApi.count(value, visibilityFilter)
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
    if (summary.value) {
      loadDashboard()
      return
    }
    void router.replace({ query: { ...route.query, q: query.value.trim() || undefined, page: undefined } })
  }, 400)
}

function filtersChanged() {
  clearTimeout(queryTimer)
  if (summary.value) {
    loadDashboard()
    return
  }
  const categoryGuid = categoryFilter.value !== '__uncategorized' ? categoryFilter.value : ''
  void router.replace({ query: {
    ...route.query,
    q: query.value.trim() || undefined,
    status: status.value || undefined,
    visibility: visibility.value === 'hidden' ? 'hidden' : undefined,
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

async function changeVisibility(document: DocumentRecord) {
  if (visibilityBusy.value) return
  const identity = auth.user?.guid
  openActions.value = ''
  if (!document.is_hidden) {
    const confirmed = await confirmAction(
      t('Dokumen disembunyikan dari daftar Anda. Penerima tetap dapat mengaksesnya.'),
      { title: t('Sembunyikan dokumen?'), action: t('Sembunyikan') },
    )
    if (!confirmed || !active || auth.user?.guid !== identity) return
  }

  visibilityBusy.value = document.guid
  actionError.value = ''
  try {
    await documentsApi.setVisibility(document.guid, !document.is_hidden)
    if (!active || auth.user?.guid !== identity) return
    notify.success(t(document.is_hidden ? 'Dokumen dikembalikan ke daftar aktif.' : 'Dokumen disembunyikan dari daftar aktif.'))
    await loadList(currentPageNumber())
    if (summary.value) await loadCounts()
  } catch (cause) {
    if (!active || auth.user?.guid !== identity) return
    const feedback = workspaceError(cause)
    actionError.value = t(feedback.message)
    if (feedback.status === 401) auth.user = null
    if ([403, 404].includes(feedback.status ?? 0))
      await loadList(currentPageNumber())
  } finally {
    if (active) visibilityBusy.value = ''
  }
}

function pageTo(number: number) {
  clearTimeout(queryTimer)
  if (summary.value) {
    loadDashboard(number)
    return
  }
  void router.replace({ query: { ...route.query, q: query.value.trim() || undefined, page: number > 1 ? String(number) : undefined } })
}

function retryList() {
  void loadList(currentPageNumber())
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
    const { data, contentDisposition } = await documentsApi.downloadPdf(document.current_version.guid)
    if (!active || auth.user?.guid !== identity) return
    const url = URL.createObjectURL(data)
    const link = window.document.createElement('a')
    link.href = url
    link.download = pdfDownloadFilename(contentDisposition)
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
  if (summary.value && loadedPath === route.path) return
  loadedPath = route.path
  clearTimeout(queryTimer)
  query.value = summary.value ? '' : queryValue('q')
  status.value = summary.value ? '' : queryValue('status')
  visibility.value = !summary.value && queryValue('visibility') === 'hidden' ? 'hidden' : 'active'
  categoryFilter.value = summary.value ? '' : queryValue('uncategorized') === '1' ? '__uncategorized' : queryValue('category_guid')
  perPage.value = !summary.value && [10, 25, 50].includes(Number(queryValue('per_page'))) ? Number(queryValue('per_page')) : 10
  selectedGuids.value = []
  actionError.value = ''
  if (summary.value) {
    const remainingQuery = { ...route.query }
    for (const key of ['q', 'status', 'visibility', 'category_guid', 'uncategorized', 'per_page', 'page']) delete remainingQuery[key]
    if (Object.keys(remainingQuery).length !== Object.keys(route.query).length)
      void router.replace({ query: remainingQuery })
    dashboardPage.value = 1
  }
  const number = currentPageNumber()
  void loadList(number)
}, { immediate: true })
watch([() => route.path, visibility], ([path]) => {
  if (path === '/dashboard') void loadCounts()
}, { immediate: true })

onMounted(() => {
  void loadCategories()
  window.document.addEventListener('pointerdown', outsideFilters)
})
onUnmounted(() => {
  active = false
  clearTimeout(queryTimer)
  listRequest++
  countRequest++
  window.document.removeEventListener('pointerdown', outsideFilters)
})
</script>

<template>
  <div v-if="summary" class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="min-w-0">
      <h1 class="text-3xl font-semibold text-ink">{{ t('Dashboard') }}</h1>
      <p class="mt-2 text-sm text-muted">{{ t('Kelola dan pantau aktivitas dokumen Anda.') }}</p>
    </div>
    <div class="w-full sm:w-auto [&>button]:w-full">
      <CreateDocumentButton ref="createDocument">+ {{ t('Buat Dokumen') }}</CreateDocumentButton>
    </div>
  </div>
  <div v-else class="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="mb-2 text-xs font-semibold tracking-[0.16em] text-primary">{{ t('Ruang dokumen Anda') }}</p>
      <h1 class="text-3xl font-semibold">{{ t('Dokumen Saya') }}</h1>
      <p class="mt-3 text-sm text-muted">{{ t('Kelola dokumen milik Anda dan ikuti statusnya.') }}</p>
    </div>
    <CreateDocumentButton />
  </div>

  <section v-if="summary" :aria-label="t('Ringkasan dokumen')" class="mb-6">
    <div class="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 lg:grid-cols-4 sm:gap-4">
      <button
        v-for="(stat, index) in stats"
        :key="stat.status"
        type="button"
        class="animate__animated animate__fadeInUp min-w-0 rounded-2xl border border-line bg-white p-4 text-left transition-colors hover:border-primary/50 hover:bg-soft/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-5"
        :style="{ animationDelay: `${index * 0.15}s` }"
        :class="status === stat.status && 'border-primary ring-1 ring-primary/20'"
        :aria-pressed="status === stat.status"
        @click="chooseStatus(stat.status)"
      >
        <span class="flex items-center justify-between gap-2 text-sm font-medium text-muted">
          {{ stat.label }}
          <span class="material-symbols-outlined text-[20px] text-primary" aria-hidden="true">{{ stat.icon }}</span>
        </span>
        <strong v-if="counts[stat.key] !== undefined" class="mt-4 block text-3xl font-semibold text-ink">{{ numberLabel(counts[stat.key]!) }}</strong>
        <span v-else-if="countsLoading" class="mt-4 block h-7 w-20 animate-pulse rounded bg-sage motion-reduce:animate-none" :aria-label="t('Memuat statistik')"></span>
        <span v-else class="mt-3 block text-sm font-medium text-error">{{ t('Belum tersedia') }}</span>
      </button>
    </div>
    <div v-if="countError" class="mt-3 flex items-center justify-between gap-4 text-sm text-muted">
      <span>{{ t('Sebagian statistik belum dapat dimuat.') }}</span>
      <button type="button" class="min-h-11 font-semibold text-primary underline" :disabled="countsLoading" @click="loadCounts">{{ t('Muat ulang statistik') }}</button>
    </div>
  </section>

    <div v-if="!summary" class="mb-5 grid gap-3 sm:grid-cols-2 sm:items-end" :class="summary ? 'xl:grid-cols-5' : '[&_.select-control-value]:bg-transparent [&_.select-control-value]:p-0 [&_.select-control-trigger]:rounded-xl [&_.select-control-trigger]:px-3'">
      <label class="grid min-w-0 gap-2 text-xs font-medium text-muted" :class="!summary && 'sm:col-span-2'">
        {{ t(summary ? 'Cari judul dokumen' : 'Cari dokumen') }}
        <span class="relative flex min-w-0 gap-2">
          <svg v-if="!summary" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg>
          <input v-model="query" type="search" maxlength="200" class="min-h-11 min-w-0 flex-1 rounded-xl border border-line bg-white pr-3 text-sm text-ink" :class="summary ? 'pl-3' : 'pl-9'" :placeholder="t(summary ? 'Cari judul dokumen' : 'Cari judul dokumen...')" @input="queryChanged" />
          <button v-if="query" type="button" class="min-h-11 shrink-0 rounded-xl border border-line px-3 text-sm text-primary" :aria-label="t('Hapus pencarian')" @click="query = ''; queryChanged()">{{ t('Bersihkan') }}</button>
        </span>
      </label>
      <label class="grid min-w-0 gap-2 text-xs font-medium text-muted">
        {{ t('Visibilitas') }}
        <SelectControl v-model="visibility" :ariaLabel="t('Visibilitas')" class="min-h-11 w-full text-sm" :options="visibilityOptions" @change="filtersChanged" />
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
        {{ t(summary ? 'Urutkan' : 'Urutkan berdasarkan') }}
        <SelectControl
          v-model="sort"
          :ariaLabel="t(summary ? 'Urutkan' : 'Urutkan berdasarkan')"
          class="min-h-11 text-sm"
          :options="[
            { value: 'created', label: t('Terbaru dibuat') },
            { value: 'title', label: t('Judul A–Z pada halaman ini') },
          ]"
        />
      </div>
    </div>

  <section class="animate__animated animate__fadeInUp min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-6" :class="!summary && 'shadow-[0_2px_10px_rgba(20,28,48,0.035)]'" :style="{ animationDelay: summary ? '0.45s' : '0.15s' }">
    <div class="mb-5 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-xl font-semibold">{{ summary ? t('Dokumen terbaru') : visibility === 'hidden' ? t('Dokumen disembunyikan') : t('Daftar dokumen') }}</h2>
        <p v-if="!summary" class="mt-2 text-sm text-muted">{{ t('Kelola dan temukan dokumen kamu dengan mudah.') }}</p>
      </div>
    </div>

    <div v-if="summary" class="mb-3 flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center">
      <label class="relative flex min-w-0 flex-1 items-center">
        <span class="sr-only">{{ t('Cari judul dokumen') }}</span>
        <span class="material-symbols-outlined pointer-events-none absolute left-3 text-[20px] text-muted" aria-hidden="true">search</span>
        <input v-model="query" type="search" maxlength="200" class="min-h-11 w-full min-w-0 rounded-xl border border-line bg-white pl-10 pr-3 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15" :placeholder="t('Cari judul dokumen...')" @input="queryChanged" />
      </label>
      <div class="flex min-w-0 flex-wrap items-center gap-2 xl:shrink-0">
        <div ref="filterMenu" class="select-control" @keydown.esc.prevent.stop="closeFilters(true)">
          <button ref="filterTrigger" type="button" class="select-control-trigger" :class="filtersOpen && 'border-primary'" :aria-label="t('Filter dokumen')" :aria-expanded="filtersOpen" aria-controls="dashboard-filters" @click="filtersOpen = !filtersOpen">
            <span class="flex items-center gap-2">
              <span class="material-symbols-outlined text-[20px] text-muted" aria-hidden="true">filter_list</span>
              {{ t('Filter') }}
              <span v-if="dashboardFilterCount" class="rounded-full bg-sage px-2 py-0.5 text-xs text-primary">{{ numberLabel(dashboardFilterCount) }}</span>
            </span>
            <span class="select-control-chevron material-symbols-outlined" :class="filtersOpen && 'rotate-180'" aria-hidden="true">expand_more</span>
          </button>
          <Transition name="workspace-dropdown">
          <div v-if="filtersOpen" id="dashboard-filters" :inert="!filtersOpen" class="absolute left-0 top-full z-30 mt-2 grid max-h-[70dvh] w-[min(20rem,calc(100vw-3rem))] origin-top-left gap-4 overflow-y-auto rounded-xl border border-line bg-white p-4 text-ink shadow-xl xl:left-auto xl:right-0 xl:origin-top-right" role="group" :aria-label="t('Filter dokumen')">
            <div class="grid gap-2 text-xs font-medium text-muted">
              {{ t('Visibilitas') }}
              <SelectControl v-model="visibility" floating :ariaLabel="t('Visibilitas')" class="min-h-11 w-full text-sm" :options="visibilityOptions" @change="filtersChanged" />
            </div>
            <div class="grid gap-2 text-xs font-medium text-muted">
              {{ t('Status') }}
              <SelectControl v-model="status" floating :ariaLabel="t('Status')" class="min-h-11 w-full text-sm" :options="[
                { value: '', label: t('Semua status') },
                { value: 'draft', label: t('Draft') },
                { value: 'in_progress', label: t('Dalam proses') },
                { value: 'finalizing', label: t('Finalisasi') },
                { value: 'completed', label: t('Selesai') },
              ]" @change="filtersChanged" />
            </div>
            <div class="grid gap-2 text-xs font-medium text-muted">
              {{ t('Kategori') }}
              <SelectControl v-model="categoryFilter" floating :ariaLabel="t('Kategori')" class="min-h-11 w-full text-sm" :options="categoryFilterOptions" @change="filtersChanged" />
            </div>
            <button type="button" class="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold text-primary hover:bg-soft" @click="resetDashboardFilters">{{ t('Reset filter') }}</button>
          </div>
          </Transition>
        </div>
        <div class="min-w-0 flex-1 xl:w-56 xl:flex-none">
          <SelectControl v-model="sort" :ariaLabel="t('Urutkan')" class="min-h-11 w-full text-sm" :options="[
            { value: 'created', label: t('Terbaru dibuat') },
            { value: 'title', label: t('Judul A–Z pada halaman ini') },
          ]" />
        </div>
        <button v-if="query" type="button" class="min-h-11 rounded-lg px-2 text-sm font-medium text-primary underline" :aria-label="t('Hapus pencarian')" @click="query = ''; queryChanged()">{{ t('Bersihkan') }}</button>
      </div>
    </div>
    <p class="mb-4 text-xs text-muted">{{ t('Pencarian judul mencakup semua dokumen pada visibilitas yang dipilih. Urutan judul hanya berlaku pada halaman yang sedang dibuka.') }}</p>
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
    <div v-else-if="summary && page && pageMatchesFilters && !page.meta.total" class="flex flex-col items-center px-2 py-12 text-center sm:py-16">
      <span class="mb-5 grid size-14 place-items-center rounded-2xl bg-soft text-primary"><span class="material-symbols-outlined text-[28px]" aria-hidden="true">{{ hasDashboardFilters ? 'search_off' : 'description' }}</span></span>
      <h3 class="text-lg font-semibold text-ink">{{ t(hasDashboardFilters ? 'Tidak ada dokumen yang cocok' : 'Belum ada dokumen') }}</h3>
      <p class="mt-2 max-w-sm text-sm leading-6 text-muted">{{ t(hasDashboardFilters ? 'Coba ubah kata kunci atau filter pencarian.' : 'Mulai dengan membuat dokumen pertama Anda.') }}</p>
      <button v-if="hasDashboardFilters" type="button" class="mt-6 min-h-11 rounded-lg border border-primary px-5 text-sm font-semibold text-primary hover:bg-soft" @click="resetDashboardFilters">{{ t('Reset filter') }}</button>
      <BaseButton v-else class="mt-6 w-full sm:w-auto" @click="createDocument?.open()">+ {{ t('Buat Dokumen') }}</BaseButton>
    </div>
    <div v-else-if="page && pageMatchesFilters && !page.meta.total" class="rounded-xl border border-dashed border-line bg-soft/60 px-6 py-12 text-center">
      <h3 class="text-lg font-semibold">{{ emptyTitle }}</h3>
      <p class="mt-2 text-sm text-muted">{{ emptyDescription }}</p>
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
                <button v-if="document.owner_guid === auth.user?.guid" type="button" class="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-soft disabled:opacity-50" :disabled="visibilityBusy === document.guid" @click="changeVisibility(document)">
                  {{ t(document.is_hidden ? 'Kembalikan ke daftar aktif' : 'Sembunyikan') }}
                </button>
                <RouterLink :to="{ path: `/documents/${document.guid}`, query: route.query }" class="block min-h-10 rounded-lg px-3 py-2 text-sm text-ink hover:bg-soft">{{ t('Lihat detail') }}</RouterLink>
              </div>
            </Transition>
          </div>
        </div>
      </article>
    </div>

    <nav v-if="page && pageMatchesFilters && (!summary || page.meta.total > 0)" class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm" :aria-label="t('Halaman dokumen')">
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
</template>

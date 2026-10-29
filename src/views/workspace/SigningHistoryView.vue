<script setup lang="ts">
import 'animate.css'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { historyApi, type SigningHistoryEvent } from '../../services/history.service'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import { useAuthStore } from '../../stores/auth'
import { statusLabel } from '../../utils/documents'
import { language, t } from '../../services/workspace-language'
import type { Page } from '../../types/documents'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
import HistoryDateRange from '../../components/ui/HistoryDateRange.vue'
import SelectControl from '../../components/ui/SelectControl.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const page = ref<Page<SigningHistoryEvent>>()
const query = ref('')
const loading = ref(false)
const loaded = ref(false)
const pageMatchesFilters = ref(false)
const error = ref('')
const summary = ref<{ total: number; signed: number; revisions: number }>()
const summaryError = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
const expandedGuid = ref('')
const details = ref<Record<string, SigningHistoryEvent>>({})
const detailErrors = ref<Record<string, string>>({})
const openingGuid = ref('')
const openError = ref('')
let requestId = 0
let active = true

const pageNumber = computed(() => Math.max(1, Number(route.query.page) || 1))
const perPage = computed(() => {
  const value = Number(queryValue('per_page'))
  return [5, 10, 25, 50].includes(value) ? value : 5
})

function queryValue(key: string) {
  const value = route.query[key]
  return typeof value === 'string' ? value : ''
}

async function load() {
  const request = ++requestId
  const identity = auth.user?.guid
  const filters = {
    q: queryValue('q'),
    date_from: queryValue('date_from'),
    date_to: queryValue('date_to'),
    page: pageNumber.value,
    perPage: perPage.value,
  }
  loading.value = true
  pageMatchesFilters.value = false
  error.value = ''
  try {
    const result = await historyApi.list(filters)
    if (!active || request !== requestId || auth.user?.guid !== identity) return
    page.value = result
    pageMatchesFilters.value = true
    loaded.value = true
  } catch (cause) {
    if (!active || request !== requestId || auth.user?.guid !== identity) return
    error.value = t(workspaceError(cause).message)
    if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
  } finally {
    if (active && request === requestId) loading.value = false
  }
}

function applySearch() {
  clearTimeout(searchTimer)
  void router.replace({
    query: { ...route.query, q: query.value.trim() || undefined, page: undefined },
  })
}

function searchChanged() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(applySearch, 400)
}

function applyDates(from: string, to: string) {
  clearTimeout(searchTimer)
  void router.replace({
    query: {
      ...route.query,
      q: query.value.trim() || undefined,
      date_from: from || undefined,
      date_to: to || undefined,
      page: undefined,
    },
  })
}

function clearFilters() {
  clearTimeout(searchTimer)
  query.value = ''
  void router.replace({
    query: {
      ...route.query,
      q: undefined,
      date_from: undefined,
      date_to: undefined,
      page: undefined,
    },
  })
}

async function loadSummary() {
  const identity = auth.user?.guid
  summaryError.value = ''
  try {
    // No aggregate endpoint yet: count all pages, independent of active list filters.
    let current = 1
    let last = 1
    let signed = 0
    let revisions = 0
    let total = 0
    do {
      const result = await historyApi.list({ page: current, perPage: 100 })
      if (!active || auth.user?.guid !== identity) return
      total = result.meta.total
      signed += result.data.filter((event) => event.action === 'assignment.signed').length
      revisions += result.data.filter(
        (event) => event.action === 'version.revision_requested',
      ).length
      last = result.meta.last_page
      current++
    } while (current <= last)
    summary.value = { total, signed, revisions }
  } catch (cause) {
    if (active && auth.user?.guid === identity)
      summaryError.value = t(workspaceError(cause).message)
  }
}
void loadSummary()

function pageTo(number: number) {
  void router.replace({ query: { ...route.query, page: number > 1 ? String(number) : undefined } })
}

function changePageSize(value: number) {
  void router.replace({
    query: {
      ...route.query,
      per_page: value === 5 ? undefined : String(value),
      page: undefined,
    },
  })
}

function actionLabel(event: SigningHistoryEvent) {
  return event.action === 'assignment.signed' ? t('Berhasil ditandatangani') : t('Meminta revisi')
}

function occurredAt(value: string) {
  const date = new Date(value)
  const locale = language.value === 'en' ? 'en-GB' : 'id-ID'
  const day = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  }).format(date)
  const time = new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(date)
  return `${day} \u00b7 ${time} WIB`
}

async function loadDetail(guid: string) {
  const identity = auth.user?.guid
  detailErrors.value[guid] = ''
  try {
    const detail = await historyApi.detail(guid)
    if (active && auth.user?.guid === identity) details.value[guid] = detail
  } catch (cause) {
    if (active && auth.user?.guid === identity)
      detailErrors.value[guid] = t(workspaceError(cause).message)
  }
}

function expand(event: SigningHistoryEvent) {
  if (expandedGuid.value === event.guid) {
    expandedGuid.value = ''
    return
  }
  expandedGuid.value = event.guid
  if (!details.value[event.guid]) void loadDetail(event.guid)
}

function retryDetail(event: SigningHistoryEvent) {
  delete details.value[event.guid]
  expandedGuid.value = event.guid
  void loadDetail(event.guid)
}

async function openDocument(event: SigningHistoryEvent) {
  if (!event.document.guid || !event.version_guid || openingGuid.value) return
  openingGuid.value = event.guid
  openError.value = ''
  try {
    await documentsApi.version(event.version_guid)
    if (!active) return
    await router.push(`/documents/${event.document.guid}/versions/${event.version_guid}/view`)
  } catch (cause) {
    if (!active) return
    if (axios.isAxiosError(cause) && [403, 404].includes(cause.response?.status ?? 0)) {
      const index = page.value?.data.findIndex((item) => item.guid === event.guid) ?? -1
      if (page.value && index >= 0)
        page.value.data[index] = {
          ...event,
          document: { ...event.document, guid: null },
          version_guid: null,
          can_access_document: false,
        }
    } else openError.value = t(workspaceError(cause).message)
  } finally {
    openingGuid.value = ''
  }
}

watch(
  () => route.fullPath,
  () => {
    query.value = queryValue('q')
    clearTimeout(searchTimer)
    expandedGuid.value = ''
    details.value = {}
    detailErrors.value = {}
    void load()
  },
  { immediate: true },
)

onUnmounted(() => {
  clearTimeout(searchTimer)
  active = false
  requestId++
})
</script>

<template>
  <header class="mb-6">
    <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
      {{ t('Aktivitas akun') }}
    </p>
    <h1 class="text-2xl font-semibold">{{ t('Riwayat Tanda Tangan') }}</h1>
    <p class="mt-2 text-sm text-muted">
      {{ t('Pantau tanda tangan berhasil dan permintaan revisi dokumen Anda.') }}
    </p>
  </header>

  <section class="mb-5 grid gap-3 sm:grid-cols-3" :aria-label="t('Ringkasan riwayat')">
    <article
      v-for="(card, index) in [
        {
          label: 'Total aktivitas',
          value: summary?.total,
          caption: 'Semua riwayat',
          color: 'text-ink',
        },
        {
          label: 'Berhasil',
          value: summary?.signed,
          caption: 'Tanda tangan',
          color: 'text-primary',
        },
        {
          label: 'Revisi',
          value: summary?.revisions,
          caption: 'Permintaan revisi',
          color: 'text-[#ab7924]',
        },
      ]"
      :key="card.label"
      class="animate__animated animate__fadeInUp rounded-xl border border-line bg-white p-4"
      :style="{ animationDelay: `${index * 0.15}s` }"
    >
      <p class="text-xs text-muted">{{ t(card.label) }}</p>
      <p
        v-if="card.value !== undefined"
        class="mt-1 text-3xl font-medium tabular-nums"
        :class="card.color"
      >
        {{ card.value }}
      </p>
      <div
        v-else
        class="mt-1 flex h-9 items-center"
        role="status"
        :aria-label="t('Memuat riwayat…')"
      >
        <span class="h-6 w-12 rounded bg-sage motion-safe:animate-pulse" aria-hidden="true"></span>
      </div>
      <p class="mt-1 text-xs text-muted">{{ t(card.caption) }}</p>
    </article>
  </section>
  <FeedbackMessage :message="summaryError" error />
  <button
    v-if="summaryError"
    type="button"
    class="mb-3 text-sm text-primary underline"
    @click="loadSummary"
  >
    {{ t('Coba lagi') }}
  </button>

  <section class="rounded-2xl border border-line bg-white p-4 sm:p-5">
    <div class="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <form
        class="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3 transition-[border-color,box-shadow] duration-150 ease-in-out focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 motion-reduce:transition-none max-sm:basis-full"
        role="search"
        @submit.prevent="applySearch"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          class="shrink-0 text-muted"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="6" />
          <path d="m15 15 5 5" />
        </svg>
        <input
          v-model="query"
          type="search"
          maxlength="200"
          class="min-h-11 w-full min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
          :aria-label="t('Cari judul dokumen')"
          :placeholder="t('Cari judul dokumen...')"
          @input="searchChanged"
        />
      </form>
      <HistoryDateRange
        :from="queryValue('date_from')"
        :to="queryValue('date_to')"
        @apply="applyDates"
      />
    </div>

    <div class="flex items-center justify-between gap-3 py-5">
      <div>
        <h2 class="font-semibold">{{ t('Aktivitas tanda tangan') }}</h2>
        <p v-if="pageMatchesFilters" class="mt-1 text-xs text-muted" aria-live="polite">
          {{ t(':count riwayat ditemukan', { count: page?.meta.total ?? 0 }) }}
        </p>
      </div>
      <span class="text-xs text-muted">{{ t('Terbaru dahulu') }}</span>
    </div>
    <FeedbackMessage :message="error || openError" error />
    <button
      v-if="error"
      type="button"
      class="mb-4 min-h-11 text-sm font-semibold text-primary underline"
      @click="load"
    >
      {{ t('Coba lagi') }}
    </button>
    <p v-if="loading" role="status" class="py-10 text-center text-sm text-muted">
      {{ t('Memuat riwayat…') }}
    </p>
    <section
      v-else-if="loaded && pageMatchesFilters && !page?.data.length"
      class="rounded-xl border border-dashed border-line px-6 py-12 text-center"
    >
      <h3 class="font-semibold">{{ t('Tidak ada riwayat pada filter ini.') }}</h3>
      <button
        type="button"
        class="mt-3 min-h-11 text-sm font-semibold text-primary underline"
        @click="clearFilters"
      >
        {{ t('Hapus filter') }}
      </button>
    </section>
    <p v-else-if="error && page" class="rounded-xl bg-yellow-50 p-4 text-sm text-yellow-900">
      {{ t('Riwayat terakhir tetap disimpan; data terbaru belum dapat dimuat.') }}
    </p>
    <div
      v-else-if="page && pageMatchesFilters"
      class="overflow-hidden rounded-xl border border-line"
    >
      <article v-for="event in page.data" :key="event.guid" class="border-b border-line p-4">
        <div class="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div class="flex min-w-0 items-start gap-3">
            <span class="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-white">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                aria-hidden="true"
              >
                <path
                  d="M13 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9zM13 3v6h6m-11 5 3 3 5-5"
                />
              </svg>
            </span>
            <div class="min-w-0">
              <h3 class="break-words font-semibold">{{ event.document.title }}</h3>
              <p class="mt-1 break-words text-xs text-muted">
                {{ t('Pemilik: :name', { name: event.document.owner.name }) }}
              </p>
              <p class="mt-1 break-all text-xs text-muted">{{ event.document.owner.email }}</p>
            </div>
          </div>
          <div class="sm:text-right">
            <time class="text-xs text-muted" :datetime="event.occurred_at">{{
              occurredAt(event.occurred_at)
            }}</time>
            <div class="mt-2">
              <span
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="
                  event.action === 'assignment.signed'
                    ? 'bg-[#d9eee3] text-primary'
                    : 'bg-orange-100 text-amber-800'
                "
                >{{ actionLabel(event) }}</span
              >
            </div>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-end gap-4 text-sm text-primary">
          <button
            type="button"
            class="min-h-10 underline underline-offset-4"
            :aria-expanded="expandedGuid === event.guid"
            :aria-controls="`history-detail-${event.guid}`"
            @click="expand(event)"
          >
            {{ t(expandedGuid === event.guid ? 'Tutup detail' : 'Lihat detail') }}
          </button>
          <button
            v-if="event.can_access_document && event.document.guid && event.version_guid"
            type="button"
            class="flex min-h-10 items-center gap-1 font-semibold disabled:opacity-50"
            :disabled="openingGuid === event.guid"
            @click="openDocument(event)"
          >
            {{ openingGuid === event.guid ? t('Membuka dokumen…') : t('Buka dokumen') }}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              aria-hidden="true"
            >
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </button>
          <span v-else class="text-xs text-muted">{{
            t('Dokumen tidak lagi dapat diakses.')
          }}</span>
        </div>
        <section
          v-if="expandedGuid === event.guid"
          :id="`history-detail-${event.guid}`"
          class="mt-4 rounded-xl bg-soft p-4"
          :aria-label="t('Detail tindakan historis')"
        >
          <FeedbackMessage :message="detailErrors[event.guid] || ''" error />
          <button
            v-if="detailErrors[event.guid]"
            type="button"
            class="min-h-10 text-sm font-semibold text-primary underline"
            @click="retryDetail(event)"
          >
            {{ t('Coba lagi') }}
          </button>
          <p v-else-if="!details[event.guid]" role="status" class="text-sm text-muted">
            {{ t('Memuat detail…') }}
          </p>
          <template v-else>
            <p class="mb-3 text-xs text-muted">
              {{
                t('Status dokumen saat ini: :status', {
                  status: t(statusLabel(event.document.status)),
                })
              }}
            </p>
            <p class="text-sm">
              <strong>{{ t('Nama saat tindakan') }}:</strong>
              {{
                details[event.guid]?.actor_snapshot_available
                  ? details[event.guid]?.actor_snapshot.name
                  : t('Identitas historis tidak tersedia.')
              }}
            </p>
            <p class="mt-1 text-sm">
              <strong>{{ t('Email saat tindakan') }}:</strong>
              {{
                details[event.guid]?.actor_snapshot_available
                  ? details[event.guid]?.actor_snapshot.email
                  : t('Identitas historis tidak tersedia.')
              }}
            </p>
            <p
              v-if="event.action === 'version.revision_requested'"
              class="mt-3 whitespace-pre-wrap break-words text-sm"
            >
              <strong>{{ t('Alasan revisi') }}:</strong>
              {{ details[event.guid]?.revision_reason || t('Tidak ada alasan yang tercatat.') }}
            </p>
          </template>
        </section>
      </article>
    </div>
    <nav
      v-if="page && pageMatchesFilters"
      class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm"
      :aria-label="t('Halaman riwayat')"
    >
      <div class="flex items-center gap-2 text-xs font-medium text-muted">
        {{ t('Tampilkan baris') }}
        <SelectControl
          :model-value="perPage"
          :ariaLabel="t('Tampilkan baris')"
          class="h-9 text-sm"
          :options="[
            { value: 5, label: '5' },
            { value: 10, label: '10' },
            { value: 25, label: '25' },
            { value: 50, label: '50' },
          ]"
          @change="changePageSize"
        />
      </div>
      <div class="ml-auto flex flex-wrap items-center gap-2">
        <span class="mr-1 text-xs text-muted">{{
          t('Menampilkan :start–:end dari :total', {
            start: page.meta.total ? (page.meta.current_page - 1) * page.meta.per_page + 1 : 0,
            end: Math.min(page.meta.current_page * page.meta.per_page, page.meta.total),
            total: page.meta.total,
          })
        }}</span>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-md border border-line bg-white text-ink hover:bg-soft disabled:text-muted disabled:opacity-50"
          :aria-label="t('Sebelumnya')"
          :disabled="loading || !page.links.prev"
          @click="pageTo(page.meta.current_page - 1)"
        >
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">chevron_left</span>
        </button>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-md border border-line bg-white text-ink hover:bg-soft disabled:text-muted disabled:opacity-50"
          :aria-label="t('Berikutnya')"
          :disabled="loading || !page.links.next"
          @click="pageTo(page.meta.current_page + 1)"
        >
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true"
            >chevron_right</span
          >
        </button>
      </div>
    </nav>
  </section>
</template>

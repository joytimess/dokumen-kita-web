<script setup lang="ts">
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

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const page = ref<Page<SigningHistoryEvent>>()
const query = ref('')
const dateFrom = ref('')
const dateTo = ref('')
const loading = ref(false)
const loaded = ref(false)
const pageMatchesFilters = ref(false)
const error = ref('')
const dateError = ref('')
const expandedGuid = ref('')
const details = ref<Record<string, SigningHistoryEvent>>({})
const detailErrors = ref<Record<string, string>>({})
const openingGuid = ref('')
const openError = ref('')
let requestId = 0
let active = true

const validDates = computed(() => !dateFrom.value || !dateTo.value || dateTo.value >= dateFrom.value)
const pageNumber = computed(() => Math.max(1, Number(route.query.page) || 1))

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

function applyFilters() {
  dateError.value = validDates.value ? '' : t('Tanggal akhir tidak boleh lebih awal dari tanggal awal.')
  if (dateError.value) return
  void router.replace({ query: {
    ...route.query,
    q: query.value.trim() || undefined,
    date_from: dateFrom.value || undefined,
    date_to: dateTo.value || undefined,
    page: undefined,
  } })
}

function clearFilters() {
  query.value = ''
  dateFrom.value = ''
  dateTo.value = ''
  dateError.value = ''
  void router.replace({ query: { ...route.query, q: undefined, date_from: undefined, date_to: undefined, page: undefined } })
}

function pageTo(number: number) {
  void router.replace({ query: { ...route.query, page: number > 1 ? String(number) : undefined } })
}

function actionLabel(event: SigningHistoryEvent) {
  return event.action === 'assignment.signed' ? t('Berhasil ditandatangani') : t('Meminta revisi')
}

function occurredAt(value: string) {
  const formatted = new Intl.DateTimeFormat(language.value === 'en' ? 'en-GB' : 'id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(value))
  return `${formatted} WIB`
}

async function loadDetail(guid: string) {
  const identity = auth.user?.guid
  detailErrors.value[guid] = ''
  try {
    const detail = await historyApi.detail(guid)
    if (active && auth.user?.guid === identity) details.value[guid] = detail
  } catch (cause) {
    if (active && auth.user?.guid === identity) detailErrors.value[guid] = t(workspaceError(cause).message)
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
      if (page.value && index >= 0) page.value.data[index] = {
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

watch(() => route.fullPath, () => {
  query.value = queryValue('q')
  dateFrom.value = queryValue('date_from')
  dateTo.value = queryValue('date_to')
  dateError.value = ''
  expandedGuid.value = ''
  details.value = {}
  detailErrors.value = {}
  void load()
}, { immediate: true })

onUnmounted(() => {
  active = false
  requestId++
})
</script>

<template>
  <div class="mb-7">
    <p class="mb-2 text-xs font-semibold tracking-[0.16em] text-primary">{{ t('Aktivitas akun') }}</p>
    <h1 class="text-3xl font-semibold">{{ t('Riwayat Tanda Tangan') }}</h1>
    <p class="mt-3 max-w-2xl text-sm text-muted">{{ t('Riwayat tanda tangan berhasil dan permintaan revisi yang Anda lakukan.') }}</p>
  </div>

  <section class="mb-5 rounded-2xl border border-line bg-white p-4 sm:p-5">
    <form class="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(14rem,1fr)_minmax(10rem,auto)_minmax(10rem,auto)_auto_auto] sm:items-end" @submit.prevent="applyFilters">
      <label class="grid gap-2 text-xs font-medium text-muted">
        {{ t('Cari judul dokumen') }}
        <input v-model="query" type="search" maxlength="200" class="min-h-11 rounded-xl border border-line px-3 text-sm text-ink" :placeholder="t('Cari judul dokumen')" />
      </label>
      <label class="grid gap-2 text-xs font-medium text-muted">
        {{ t('Dari tanggal') }}
        <input v-model="dateFrom" type="date" class="min-h-11 rounded-xl border border-line px-3 text-sm text-ink" />
      </label>
      <label class="grid gap-2 text-xs font-medium text-muted">
        {{ t('Sampai tanggal') }}
        <input v-model="dateTo" type="date" class="min-h-11 rounded-xl border border-line px-3 text-sm text-ink" :aria-invalid="!validDates" />
      </label>
      <button type="submit" class="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50" :disabled="!validDates">{{ t('Terapkan filter') }}</button>
      <button type="button" class="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold text-ink" @click="clearFilters">{{ t('Hapus filter') }}</button>
    </form>
    <p v-if="!validDates || dateError" class="mt-2 text-sm text-error">{{ dateError || t('Tanggal akhir tidak boleh lebih awal dari tanggal awal.') }}</p>
    <p class="mt-2 text-xs text-muted">{{ t('Waktu riwayat menggunakan zona Asia/Jakarta (WIB).') }}</p>
  </section>

  <FeedbackMessage :message="error || openError" error />
  <button v-if="error" type="button" class="mb-4 min-h-11 text-sm font-semibold text-primary underline" @click="load">{{ t('Coba lagi') }}</button>
  <p v-if="loading" role="status" class="py-10 text-center text-sm text-muted">{{ t('Memuat riwayat…') }}</p>
  <section v-else-if="loaded && pageMatchesFilters && !page?.data.length" class="rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
    <h2 class="text-xl font-semibold">{{ t('Belum ada riwayat yang sesuai.') }}</h2>
    <p class="mt-2 text-sm text-muted">{{ t('Tanda tangan berhasil dan permintaan revisi akan tampil di sini.') }}</p>
  </section>
  <p v-else-if="error && page" class="rounded-xl bg-yellow-50 p-4 text-sm text-yellow-900">{{ t('Riwayat terakhir tetap disimpan; data terbaru belum dapat dimuat.') }}</p>
  <section v-else-if="page && pageMatchesFilters" class="overflow-hidden rounded-2xl border border-line bg-white">
    <article v-for="event in page.data" :key="event.guid" class="border-b border-line p-4 last:border-b-0 sm:p-5">
      <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,auto)] lg:items-start">
        <div class="min-w-0">
          <h2 class="break-words font-semibold text-ink">{{ event.document.title }}</h2>
          <p class="mt-1 text-sm text-muted">{{ t('Pemilik: :name', { name: event.document.owner.name }) }} · {{ event.document.owner.email }}</p>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <span class="rounded-full bg-sage px-3 py-1 text-xs font-semibold text-primary">{{ actionLabel(event) }}</span>
            <span class="text-xs text-muted">{{ t('Status dokumen saat ini: :status', { status: t(statusLabel(event.document.status)) }) }}</span>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-between gap-3 lg:justify-end">
          <time class="text-sm text-muted" :datetime="event.occurred_at">{{ occurredAt(event.occurred_at) }}</time>
          <button type="button" class="min-h-10 rounded-lg px-3 text-sm font-semibold text-primary underline" :aria-expanded="expandedGuid === event.guid" @click="expand(event)">{{ t(expandedGuid === event.guid ? 'Tutup detail' : 'Lihat detail') }}</button>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-3">
        <button v-if="event.can_access_document && event.document.guid && event.version_guid" type="button" class="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50" :disabled="openingGuid === event.guid" @click="openDocument(event)">{{ openingGuid === event.guid ? t('Membuka dokumen…') : t('Buka dokumen') }}</button>
        <span v-else class="text-sm text-muted">{{ t('Dokumen tidak lagi dapat diakses.') }}</span>
      </div>
      <section v-if="expandedGuid === event.guid" class="mt-4 rounded-xl bg-soft p-4" :aria-label="t('Detail tindakan historis')">
        <FeedbackMessage :message="detailErrors[event.guid] || ''" error />
        <button v-if="detailErrors[event.guid]" type="button" class="min-h-10 text-sm font-semibold text-primary underline" @click="retryDetail(event)">{{ t('Coba lagi') }}</button>
        <p v-else-if="!details[event.guid]" role="status" class="text-sm text-muted">{{ t('Memuat detail…') }}</p>
        <template v-else>
          <p class="text-sm"><strong>{{ t('Nama saat tindakan') }}:</strong> {{ details[event.guid]?.actor_snapshot_available ? details[event.guid]?.actor_snapshot.name : t('Identitas historis tidak tersedia.') }}</p>
          <p class="mt-1 text-sm"><strong>{{ t('Email saat tindakan') }}:</strong> {{ details[event.guid]?.actor_snapshot_available ? details[event.guid]?.actor_snapshot.email : t('Identitas historis tidak tersedia.') }}</p>
          <p v-if="event.action === 'version.revision_requested'" class="mt-3 whitespace-pre-wrap break-words text-sm"><strong>{{ t('Alasan revisi') }}:</strong> {{ details[event.guid]?.revision_reason || t('Tidak ada alasan yang tercatat.') }}</p>
        </template>
      </section>
    </article>
    <nav class="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-4 text-sm sm:px-5" :aria-label="t('Halaman riwayat')">
      <span class="text-xs text-muted">{{ t('Halaman :current dari :last', { current: page.meta.current_page, last: page.meta.last_page }) }}</span>
      <div class="flex gap-2">
        <button type="button" class="min-h-10 rounded-lg border border-line px-3 disabled:opacity-50" :disabled="loading || !page.links.prev" @click="pageTo(page.meta.current_page - 1)">{{ t('Sebelumnya') }}</button>
        <button type="button" class="min-h-10 rounded-lg border border-line px-3 disabled:opacity-50" :disabled="loading || !page.links.next" @click="pageTo(page.meta.current_page + 1)">{{ t('Berikutnya') }}</button>
      </div>
    </nav>
  </section>
</template>

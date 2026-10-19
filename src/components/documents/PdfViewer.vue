<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import { createReadGate } from '../../utils/readGate'
import { findTextMatches, textMatchSnippet, visibleOcrMatches, type TextMatch } from '../../utils/pdfSearch'
import type { DocumentOcrMatch, DocumentOcrStatus, Placeholder } from '../../types/documents'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import SelectControl from '../ui/SelectControl.vue'
import { formatNumber, t } from '../../services/workspace-language'
import { resizePlaceholder, type ResizeCorner } from '../../utils/signaturePlacement'
GlobalWorkerOptions.workerSrc = workerUrl
const props = defineProps<{
  versionGuid: string
  expectedHash?: string | null
  overlays?: (Placeholder & { label?: string; image?: string; color?: string })[]
  editable?: boolean
  selectedOverlay?: number
}>()
const emit = defineEmits<{
  ready: [hash: string, count: number]
  gate: [eligible: boolean]
  failure: []
  place: [page: number, x: number, y: number]
  moved: [index: number, x: number, y: number]
  selected: [index: number]
  resized: [index: number, geometry: Pick<Placeholder, 'x' | 'y' | 'width' | 'height'>]
  page: [page: number]
}>()
const canvas = ref<HTMLCanvasElement>(),
  textLayer = ref<HTMLDivElement>(),
  scroller = ref<HTMLDivElement>(),
  sheet = ref<HTMLDivElement>(),
  bottom = ref<HTMLDivElement>()
const page = ref(1),
  count = ref(0),
  jump = ref(1),
  zoom = ref(1),
  fit = ref(true),
  width = ref(600),
  height = ref(800)
const busy = ref(false),
  rendering = ref(false),
  error = ref(''),
  query = ref(''),
  searching = ref(false),
  scanned = ref(0),
  noText = ref(false)
const hits = ref<(TextMatch & { page: number; snippet: string; matchedText: string })[]>([]),
  activeHit = ref(-1)
const ocrStatus = ref<DocumentOcrStatus | null>(null),
  ocrHits = ref<DocumentOcrMatch[]>([]),
  ocrError = ref('')
const read = createReadGate()
let pdf: PDFDocumentProxy | undefined,
  task: ReturnType<typeof getDocument> | undefined,
  renderTask: RenderTask | undefined,
  textTask: TextLayer | undefined
let observer: IntersectionObserver | undefined, resize: ResizeObserver | undefined
let resizeFrame = 0, lastResizeWidth = 0
let fetchController: AbortController | undefined,
  ocrController: AbortController | undefined,
  ocrTimer: ReturnType<typeof setTimeout> | undefined,
  ocrStart: Promise<void> | undefined,
  pdfHash = '',
  generation = 0,
  renderGeneration = 0,
  searchGeneration = 0,
  disposed = false
let drag: { index: number; startX: number; startY: number; area: Placeholder; corner?: ResizeCorner; width: number; height: number } | undefined
let activeSearchTerm = '',
  searchTimer: ReturnType<typeof setTimeout> | undefined
const pageOverlays = computed(() =>
  (props.overlays ?? [])
    .map((p, index) => ({ ...p, index }))
    .filter((p) => p.page_number === page.value),
)
const visibleOcrHits = computed(() => visibleOcrMatches(ocrHits.value, hits.value))
const results = computed(() => [
  ...hits.value.map((hit, index) => ({ id: `native:${hit.page}:${hit.offset}:${index}`, page: hit.page, snippet: hit.snippet })),
  ...visibleOcrHits.value.map((hit) => ({ id: `ocr:${hit.match_id}`, page: hit.page_number, snippet: hit.snippet })),
])
const ocrStatusMessage = computed(() => {
  const status = ocrStatus.value
  if (!status) return ''
  const failure = status.failed_pages[0]?.error_code
  const failureText: Record<string, string> = {
    OCR_LIMIT_EXCEEDED: 'PDF melewati batas OCR 1 MB atau 3 halaman; pencarian teks native tetap tersedia.',
    OCR_QUOTA_EXHAUSTED: 'Kuota OCR habis; coba lagi setelah kuota tersedia.',
    OCR_SERVICE_UNAVAILABLE: 'Layanan OCR sedang bermasalah; halaman gagal dapat dicoba ulang.',
    OCR_TEXT_UNRECOGNIZED: 'Sebagian teks tidak terbaca; gunakan scan yang lebih jelas.',
    OCR_PDF_UNAVAILABLE: 'Berkas PDF OCR tidak tersedia untuk diproses.',
  }
  if (status.processing_status === 'unavailable')
    return t('OCR belum dikonfigurasi; pencarian teks digital tetap tersedia.')
  if (status.processing_status === 'queued' || status.processing_status === 'processing')
    return t('Memproses OCR: :completed/:total halaman; :failed gagal.', status.page_counts)
  if (status.processing_status === 'partial')
    return `${t('OCR selesai sebagian: :completed/:total halaman; :failed gagal.', status.page_counts)} ${failure ? t(failureText[failure] ?? 'OCR gagal pada sebagian halaman.') : ''}`
  if (status.processing_status === 'failed')
    return `${t('OCR gagal: :failed dari :total halaman.', status.page_counts)} ${failure ? t(failureText[failure] ?? 'OCR gagal pada sebagian halaman.') : ''}`
  if (status.processing_status === 'completed' && status.ocr_page_counts.total > 0 && status.ocr_page_counts.recognized === 0)
    return t('OCR selesai, tetapi tidak menemukan teks yang dapat dikenali; pencarian teks digital tetap tersedia.')
  return t('Pencarian teks siap: :completed/:total halaman.', status.page_counts)
})
watch(read.eligible, (value) => emit('gate', value))
function highlight() {
  const divs = textTask?.textDivs ?? []
  const active = activeHit.value < hits.value.length ? hits.value[activeHit.value] : undefined
  const activeSegments = new Set(active?.page === page.value
    ? active.segments.map((segment) => `${segment.item}:${segment.start}:${segment.end}`)
    : [])
  const matches = findTextMatches(
    divs.map((div) => div.textContent ?? ''),
    query.value,
  )
  divs.forEach((div, index) => {
    const text = div.textContent ?? ''
    div.replaceChildren()
    let cursor = 0
    for (const segment of matches
      .flatMap((match) => match.segments)
      .filter((part) => part.item === index)) {
      div.append(document.createTextNode(text.slice(cursor, segment.start)))
      const mark = document.createElement('mark')
      mark.className = activeSegments.has(`${segment.item}:${segment.start}:${segment.end}`)
        ? 'bg-orange-400/80 text-transparent outline outline-1 outline-blue-800'
        : 'bg-yellow-300/60 text-transparent'
      mark.textContent = text.slice(segment.start, segment.end)
      div.append(mark)
      cursor = segment.end
    }
    div.append(document.createTextNode(text.slice(cursor)))
  })
}
function scrollToHit() {
  if (activeHit.value >= hits.value.length) return
  const hit = hits.value[activeHit.value]
  if (hit?.page === page.value)
    textTask?.textDivs[hit.item]?.scrollIntoView({ block: 'center', behavior: 'instant' })
}
function scheduleOcrPoll(serial: number, delay = 2000) {
  clearTimeout(ocrTimer)
  ocrTimer = setTimeout(() => void pollOcr(serial), delay)
}
async function pollOcr(serial: number) {
  if (serial !== generation || disposed || !pdfHash) return
  ocrController?.abort()
  ocrController = new AbortController()
  const controller = ocrController
  const searchSerial = searchGeneration
  const term = activeSearchTerm
  try {
    const status = await documentsApi.ocr(props.versionGuid, pdfHash, term, controller.signal)
    if (serial !== generation || disposed) return
    ocrStatus.value = status
    ocrError.value = ''
    if (searchSerial === searchGeneration) ocrHits.value = status.matches
    if (status.processing_status === 'queued' || status.processing_status === 'processing')
      scheduleOcrPoll(serial)
  } catch (cause) {
    if (serial === generation && !disposed && !controller.signal.aborted) {
      const failure = workspaceError(cause)
      ocrError.value = failure.message
      if (failure.ambiguous && ['queued', 'processing'].includes(ocrStatus.value?.processing_status ?? ''))
        scheduleOcrPoll(serial, 5000)
    }
  }
}
async function beginOcr(hash: string, serial: number) {
  if (!hash) return
  try {
    const status = await documentsApi.startOcr(props.versionGuid, hash)
    if (serial !== generation || disposed) return
    ocrStatus.value = status
    ocrError.value = ''
    if (status.processing_status === 'queued' || status.processing_status === 'processing')
      scheduleOcrPoll(serial)
  } catch (cause) {
    if (serial === generation && !disposed) ocrError.value = workspaceError(cause).message
  }
}
async function refreshOcr(term: string, searchSerial: number, serial: number) {
  if (!pdfHash) return
  ocrController?.abort()
  ocrController = new AbortController()
  const controller = ocrController
  try {
    const status = await documentsApi.ocr(props.versionGuid, pdfHash, term, controller.signal)
    if (serial !== generation || searchSerial !== searchGeneration || disposed) return
    ocrStatus.value = status
    ocrHits.value = status.matches
    ocrError.value = ''
    if (status.processing_status === 'queued' || status.processing_status === 'processing')
      scheduleOcrPoll(serial)
  } catch (cause) {
    if (serial === generation && searchSerial === searchGeneration && !disposed && !controller.signal.aborted)
      ocrError.value = workspaceError(cause).message
  }
}
async function render() {
  if (!pdf || !canvas.value || !textLayer.value || !scroller.value) return
  const serial = ++renderGeneration
  const previousRender = renderTask
  previousRender?.cancel()
  textTask?.cancel()
  observer?.disconnect()
  rendering.value = true
  error.value = ''
  emit('gate', false)
  try {
    await previousRender?.promise.catch(() => {})
    if (serial !== renderGeneration || disposed) return
    const current = await pdf.getPage(page.value)
    if (serial !== renderGeneration || disposed) return
    const original = current.getViewport({ scale: 1 })
    const scale = fit.value
      ? Math.max(0.1, (scroller.value.clientWidth - 24) / original.width)
      : zoom.value
    const viewport = current.getViewport({ scale })
    width.value = viewport.width
    height.value = viewport.height
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const target = canvas.value
    target.width = Math.floor(viewport.width * ratio)
    target.height = Math.floor(viewport.height * ratio)
    const context = target.getContext('2d')!
    renderTask = current.render({
      canvas: target,
      canvasContext: context,
      viewport,
      transform: [ratio, 0, 0, ratio, 0, 0],
    })
    await renderTask.promise
    if (serial !== renderGeneration || disposed) return
    const text = await current.getTextContent()
    if (serial !== renderGeneration || disposed) return
    textLayer.value!.replaceChildren()
    textLayer.value!.style.setProperty('--scale-factor', String(scale))
    textLayer.value!.style.setProperty('--total-scale-factor', String(scale))
    textTask = new TextLayer({ textContentSource: text, container: textLayer.value!, viewport })
    await textTask.render()
    if (serial !== renderGeneration || disposed) return
    noText.value = !text.items.some((item) => 'str' in item && item.str.trim())
    highlight()
    scrollToHit()
    read.recovered()
    read.visit(page.value)
    emit('gate', read.eligible.value)
    await nextTick()
    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !rendering.value) read.end(page.value)
      },
      { root: scroller.value, threshold: 1 },
    )
    if (bottom.value) observer.observe(bottom.value)
  } catch (cause) {
    if (
      serial !== renderGeneration ||
      disposed ||
      (cause as Error).name === 'RenderingCancelledException'
    )
      return
    error.value = 'Halaman PDF belum dapat dimuat. Coba muat halaman lagi.'
    read.error()
    emit('failure')
  } finally {
    if (serial === renderGeneration) rendering.value = false
  }
}
async function load() {
  const serial = ++generation
  ++renderGeneration
  ++searchGeneration
  fetchController?.abort()
  ocrController?.abort()
  clearTimeout(ocrTimer)
  clearTimeout(searchTimer)
  renderTask?.cancel()
  textTask?.cancel()
  await task?.destroy()
  if (serial !== generation || disposed) return
  pdf = undefined
  task = undefined
  read.reset()
  page.value = 1
  count.value = 0
  hits.value = []
  ocrHits.value = []
  ocrStatus.value = null
  ocrError.value = ''
  ocrStart = undefined
  pdfHash = ''
  query.value = ''
  error.value = ''
  busy.value = true
  fetchController = new AbortController()
  try {
    const response = await documentsApi.pdf(props.versionGuid, fetchController.signal)
    if (serial !== generation || disposed) return
    const hash = response.hash || props.expectedHash || ''
    if (response.hash && props.expectedHash && response.hash !== props.expectedHash)
      throw new Error('HASH_CHANGED')
    const assets = `${import.meta.env.BASE_URL}pdfjs/`
    task = getDocument({ data: response.data, cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/`, iccUrl: `${assets}iccs/` })
    pdf = await task.promise
    if (serial !== generation || disposed) return
    count.value = pdf.numPages
    read.reset(count.value)
    pdfHash = hash
    ocrStart = beginOcr(hash, serial)
    emit('ready', hash, count.value)
    await render()
  } catch (cause) {
    if (serial !== generation || disposed) return
    error.value =
      cause instanceof Error && cause.message === 'HASH_CHANGED'
        ? 'Versi dokumen berubah. Muat ulang detail sebelum melanjutkan.'
        : workspaceError(cause).message
    read.error()
    emit('failure')
  } finally {
    if (serial === generation) busy.value = false
  }
}
function navigate(number: number) {
  if (Number.isInteger(number) && number >= 1 && number <= count.value && number !== page.value) {
    page.value = number
    scroller.value?.scrollTo({ top: 0, left: 0 })
    void render()
  }
}
watch(page, (value) => {
  jump.value = value
  drag = undefined
  emit('page', value)
})
watch([zoom, fit], () => {
  void render()
})
watch(
  () => [props.versionGuid, props.expectedHash],
  () => {
    void load()
  },
)
async function search() {
  clearTimeout(searchTimer)
  const serial = ++searchGeneration,
    term = query.value.trim().toLowerCase()
  activeSearchTerm = term
  ocrController?.abort()
  hits.value = []
  ocrHits.value = []
  activeHit.value = -1
  scanned.value = 0
  ocrError.value = ''
  highlight()
  if (!pdf || !term) return
  searching.value = true
  try {
    for (let p = 1; p <= count.value; p++) {
      const target = await pdf.getPage(p)
      const text = await target.getTextContent()
      if (serial !== searchGeneration || disposed) return
      const items = text.items.filter((item) => 'str' in item)
      const itemTexts = items.map((item) => item.str)
      hits.value.push(
        ...findTextMatches(itemTexts, term).map((match) => ({
          ...match,
          page: p,
          snippet: textMatchSnippet(itemTexts, match),
          matchedText: match.segments.map((segment) => itemTexts[segment.item]?.slice(segment.start, segment.end) ?? '').join(' '),
        })),
      )
      scanned.value = p
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    await ocrStart
    if (serial !== searchGeneration || disposed) return
    await refreshOcr(term, serial, generation)
    if (results.value.length) nextHit(1)
  } catch {
    if (serial === searchGeneration)
      error.value = 'Pencarian belum lengkap karena halaman gagal dibaca.'
  } finally {
    if (serial === searchGeneration) searching.value = false
  }
}
function nextHit(delta: number) {
  if (!results.value.length) return
  selectHit((activeHit.value + delta + results.value.length) % results.value.length)
}
function selectHit(index: number) {
  const result = results.value[index]
  if (!result) return
  activeHit.value = index
  if (page.value !== result.page) navigate(result.page)
  else {
    highlight()
    scrollToHit()
  }
}
function changeZoom(value: string | number) {
  fit.value = value === 'fit'
  if (!fit.value) zoom.value = Number(value)
}
function clearSearch() {
  searchGeneration++
  activeSearchTerm = ''
  ocrController?.abort()
  hits.value = []
  ocrHits.value = []
  activeHit.value = -1
  searching.value = false
  highlight()
}
function scheduleSearch() {
  clearTimeout(searchTimer)
  clearSearch()
  if (query.value.trim()) searchTimer = setTimeout(() => void search(), 400)
}
async function retryOcr() {
  if (!pdfHash || !ocrStatus.value) return
  const pages = ocrStatus.value.failed_pages.filter((item) => item.retryable).map((item) => item.page_number)
  if (!pages.length) return
  try {
    ocrStatus.value = await documentsApi.retryOcr(props.versionGuid, pdfHash, pages)
    ocrError.value = ''
    scheduleOcrPoll(generation)
  } catch (cause) {
    ocrError.value = workspaceError(cause).message
  }
}
function place(event: MouseEvent) {
  if (
    !props.editable ||
    rendering.value ||
    !sheet.value ||
    (event.target as HTMLElement).closest('[data-overlay]')
  )
    return
  const bounds = sheet.value.getBoundingClientRect()
  emit(
    'place',
    page.value,
    (event.clientX - bounds.left) / bounds.width,
    (event.clientY - bounds.top) / bounds.height,
  )
}
function startDrag(event: PointerEvent, index: number, corner?: ResizeCorner) {
  if (!props.editable || rendering.value || error.value || !sheet.value || event.button !== 0) return
  event.preventDefault()
  const area = props.overlays![index]!
  const bounds = sheet.value.getBoundingClientRect()
  emit('selected', index)
  drag = { index, startX: event.clientX, startY: event.clientY, area: { ...area }, corner, width: bounds.width, height: bounds.height }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function moveDrag(event: PointerEvent) {
  if (!drag || !props.editable || rendering.value) return
  event.preventDefault()
  const dx = (event.clientX - drag.startX) / drag.width
  const dy = (event.clientY - drag.startY) / drag.height
  if (drag.corner) {
    emit('resized', drag.index, resizePlaceholder(drag.area, dx, dy, drag.corner, {width:Math.max(0.05,44/drag.width),height:Math.max(0.03,28/drag.height)}))
    return
  }
  emit(
    'moved',
    drag.index,
    drag.area.x + dx,
    drag.area.y + dy,
  )
}
defineExpose({ navigate })
onMounted(() => {
  void load()
  resize = new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(() => {
      const available = scroller.value?.clientWidth ?? 0
      if (!fit.value || available === lastResizeWidth || disposed) return
      lastResizeWidth = available
      void render()
    })
  })
  if (scroller.value) resize.observe(scroller.value)
})
onUnmounted(() => {
  disposed = true
  generation++
  renderGeneration++
  searchGeneration++
  fetchController?.abort()
  ocrController?.abort()
  clearTimeout(ocrTimer)
  clearTimeout(searchTimer)
  observer?.disconnect()
  resize?.disconnect()
  cancelAnimationFrame(resizeFrame)
  renderTask?.cancel()
  textTask?.cancel()
  void task?.destroy()
  pdf = undefined
})
</script>
<template>
  <section
    class="min-w-0 rounded-xl border border-line bg-white p-3 sm:p-4"
    :aria-label="t('Pembaca PDF')"
  >
    <div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
      <button
        class="min-h-11 rounded border border-line px-3 disabled:opacity-40"
        :aria-label="t('Halaman sebelumnya')"
        :disabled="page <= 1 || rendering"
        @click="navigate(page - 1)"
      >
        ←</button
      ><span>{{ t('Halaman :current / :count', { current: formatNumber(page), count: count ? formatNumber(count) : '…' }) }}</span
      ><button
        class="min-h-11 rounded border border-line px-3 disabled:opacity-40"
        :aria-label="t('Halaman berikutnya')"
        :disabled="page >= count || rendering"
        @click="navigate(page + 1)"
      >
        →
      </button>
      <form class="flex items-center gap-2" @submit.prevent="navigate(Number(jump))">
        <label class="sr-only" for="pdf-page">{{ t('Ke halaman') }}</label
        ><input
          id="pdf-page"
          v-model.number="jump"
          class="min-h-11 w-16 rounded border border-line px-2"
          type="number"
          min="1"
          :max="count"
        /><button class="min-h-11 px-2 text-primary">{{ t('Buka') }}</button>
      </form>
      <div class="flex items-center gap-2">
        {{ t('Zoom') }}
        <SelectControl
          :model-value="fit ? 'fit' : zoom"
          :ariaLabel="t('Zoom')"
          class="min-h-11"
          :options="[
            { value: 'fit', label: t('Sesuai lebar') },
            ...[0.5, 0.75, 1, 1.25, 1.5, 2].map((scale) => ({ value: scale, label: `${scale * 100}%` })),
          ]"
          @change="changeZoom"
        />
      </div>
    </div>
    <form class="mb-3 flex flex-wrap items-center gap-2 text-xs" @submit.prevent="search">
      <label class="sr-only" for="pdf-search">{{ t('Cari teks PDF') }}</label
      ><input
        id="pdf-search"
        v-model="query"
        type="search"
        maxlength="120"
        class="min-h-11 min-w-0 flex-1 rounded border border-line px-3"
        :placeholder="t('Cari teks dalam PDF')"
        @input="scheduleSearch"
      /><button class="min-h-11 px-3 text-primary">{{ t('Cari') }}</button
      ><button
        type="button"
        class="min-h-11 px-2 disabled:opacity-40"
        :disabled="!results.length"
        :aria-label="t('Hasil sebelumnya')"
        @click="nextHit(-1)"
      >
        ↑</button
      ><button
        type="button"
        class="min-h-11 px-2 disabled:opacity-40"
        :disabled="!results.length"
        :aria-label="t('Hasil berikutnya')"
        @click="nextHit(1)"
      >
        ↓</button
      ><span role="status">{{
        searching
          ? t('Mencari :scanned/:count halaman · :hits hasil sementara', { scanned: formatNumber(scanned), count: formatNumber(count), hits: formatNumber(results.length) })
          : t(':hits hasil:active', { hits: formatNumber(results.length), active: activeHit >= 0 ? ` · ${formatNumber(activeHit + 1)}` : '' })
      }}</span>
    </form>
    <p v-if="ocrStatus" class="mb-2 text-xs text-muted" role="status">{{ ocrStatusMessage }}</p>
    <p v-if="visibleOcrHits.length" class="mb-2 text-xs text-muted" role="status">
      {{ t('Hasil OCR hanya tersedia sebagai teks; posisi kata tidak tersedia.') }}
    </p>
    <FeedbackMessage :message="t(ocrError)" error />
    <button
      v-if="ocrStatus?.failed_pages.some((item) => item.retryable)"
      class="mb-3 min-h-11 text-sm text-primary underline"
      @click="retryOcr"
    >
      {{ t('Coba ulang halaman OCR yang gagal') }}
    </button>
    <ol
      v-if="results.length"
      class="mb-3 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line p-1"
      :aria-label="t('Hasil pencarian PDF')"
    >
      <li v-for="(hit, index) in results" :key="hit.id">
        <button
          type="button"
          class="flex min-h-11 w-full flex-col items-start gap-1 rounded px-2 py-1 text-left text-xs hover:bg-soft"
          :class="index === activeHit ? 'bg-primary/10 font-semibold text-primary' : 'text-muted'"
          :aria-pressed="index === activeHit"
          :aria-label="t('Hasil :index, halaman :page', { index: formatNumber(index + 1), page: formatNumber(hit.page) })"
          @click="selectHit(index)"
        >
          <span>{{ t('Halaman :page', { page: formatNumber(hit.page) }) }}</span>
          <span class="font-normal">{{ hit.snippet }}</span>
        </button>
      </li>
    </ol>
    <FeedbackMessage :message="t(error)" error /><button
      v-if="error"
      class="mb-3 min-h-11 text-sm text-primary underline"
      @click="pdf ? render() : load()"
    >
      {{ t('Coba muat lagi') }}
    </button>
    <p v-if="busy || rendering" class="mb-3 text-xs text-muted" role="status">
      {{ busy ? t('Memuat PDF…') : t('Merender halaman…') }}
    </p>
    <p v-if="noText" class="mb-3 text-xs text-muted">
      {{ t('Halaman ini tidak memiliki lapisan teks native.') }}
    </p>
    <div
      ref="scroller"
      class="max-h-[72dvh] min-h-48 overflow-auto overscroll-contain rounded bg-line p-3"
    >
      <div
        ref="sheet"
        class="relative mx-auto bg-white shadow-sm"
        :style="{ width: `${width}px`, height: `${height}px` }"
        @click="place"
      >
        <canvas
          ref="canvas"
          class="block h-full w-full"
          :class="rendering || error ? 'invisible' : ''"
        ></canvas>
        <div
          ref="textLayer"
          class="textLayer"
          :class="editable || rendering || error ? 'pointer-events-none invisible' : ''"
        ></div>
        <div
          v-for="area in pageOverlays"
          :key="area.index"
          data-overlay
          class="signature-overlay absolute flex items-center justify-center border-2 text-center text-[10px]"
          :class="[editable ? 'touch-none cursor-move' : 'pointer-events-none', selectedOverlay === area.index && editable ? 'z-10 border-solid ring-2 ring-offset-2' : 'border-dashed']"
          :role="editable ? 'button' : undefined"
          :tabindex="editable ? 0 : undefined"
          :aria-label="area.label || t('Tanda tangan')"
          :aria-pressed="editable ? selectedOverlay === area.index : undefined"
          :style="{
            left: `${area.x * 100}%`,
            top: `${area.y * 100}%`,
            width: `${area.width * 100}%`,
            height: `${area.height * 100}%`,
            '--recipient-color': area.color || 'var(--color-primary)',
          }"
          @pointerdown.stop="startDrag($event, area.index)"
          @click.stop
          @keydown.enter.prevent="editable && emit('selected', area.index)"
          @keydown.space.prevent="editable && emit('selected', area.index)"
          @pointermove="moveDrag"
          @pointerup="drag = undefined"
          @pointercancel="drag = undefined"
          @lostpointercapture="drag = undefined"
        >
          <img
            v-if="area.image"
            :src="area.image"
            :alt="t('Tanda tangan pilihan Anda')"
            class="h-full w-full object-contain"
          /><span v-else class="max-h-full overflow-hidden px-1 break-words">{{ area.label || t('Tanda tangan') }}</span>
          <template v-if="editable && selectedOverlay === area.index">
            <span v-for="corner in (['nw', 'ne', 'sw', 'se'] as const)" :key="corner"
              :data-resize="corner" aria-hidden="true"
              class="absolute z-20 grid size-6 touch-none place-items-center"
              :class="[corner.includes('n') ? '-top-3' : '-bottom-3', corner.includes('w') ? '-left-3' : '-right-3', ['nw', 'se'].includes(corner) ? 'cursor-nwse-resize' : 'cursor-nesw-resize']"
              @pointerdown.stop="startDrag($event, area.index, corner)"
              @pointermove.stop="moveDrag" @pointerup.stop="drag = undefined" @pointercancel.stop="drag = undefined">
              <span class="size-2.5 border border-white bg-current"></span>
            </span>
          </template>
        </div>
        <div ref="bottom" class="absolute inset-x-0 bottom-0 h-px"></div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.signature-overlay { color: var(--recipient-color); border-color: var(--recipient-color); background: color-mix(in srgb, var(--recipient-color) 12%, transparent); --tw-ring-color: var(--recipient-color); }
</style>

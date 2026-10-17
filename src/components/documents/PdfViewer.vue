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
import { findTextMatches, type TextMatch } from '../../utils/pdfSearch'
import type { Placeholder } from '../../types/documents'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import SelectControl from '../ui/SelectControl.vue'
import { formatNumber, t } from '../../services/workspace-language'
GlobalWorkerOptions.workerSrc = workerUrl
const props = defineProps<{
  versionGuid: string
  expectedHash?: string | null
  overlays?: (Placeholder & { label?: string; image?: string })[]
  editable?: boolean
}>()
const emit = defineEmits<{
  ready: [hash: string, count: number]
  gate: [eligible: boolean]
  failure: []
  place: [page: number, x: number, y: number]
  moved: [index: number, x: number, y: number]
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
const hits = ref<(TextMatch & { page: number })[]>([]),
  activeHit = ref(-1)
const read = createReadGate()
let pdf: PDFDocumentProxy | undefined,
  task: ReturnType<typeof getDocument> | undefined,
  renderTask: RenderTask | undefined,
  textTask: TextLayer | undefined
let observer: IntersectionObserver | undefined, resize: ResizeObserver | undefined
let fetchController: AbortController | undefined,
  generation = 0,
  renderGeneration = 0,
  searchGeneration = 0,
  disposed = false
let drag: { index: number; startX: number; startY: number; x: number; y: number } | undefined
const pageOverlays = computed(() =>
  (props.overlays ?? [])
    .map((p, index) => ({ ...p, index }))
    .filter((p) => p.page_number === page.value),
)
watch(read.eligible, (value) => emit('gate', value))
function highlight() {
  const divs = textTask?.textDivs ?? []
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
      mark.className = 'bg-yellow-300/60 text-transparent'
      mark.textContent = text.slice(segment.start, segment.end)
      div.append(mark)
      cursor = segment.end
    }
    div.append(document.createTextNode(text.slice(cursor)))
  })
}
function scrollToHit() {
  const hit = hits.value[activeHit.value]
  if (hit?.page === page.value)
    textTask?.textDivs[hit.item]?.scrollIntoView({ block: 'center', behavior: 'instant' })
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
  const serial = ++searchGeneration,
    term = query.value.trim().toLowerCase()
  hits.value = []
  activeHit.value = -1
  scanned.value = 0
  highlight()
  if (!pdf || !term) return
  searching.value = true
  try {
    for (let p = 1; p <= count.value; p++) {
      const target = await pdf.getPage(p)
      const text = await target.getTextContent()
      if (serial !== searchGeneration || disposed) return
      const items = text.items.filter((item) => 'str' in item)
      hits.value.push(
        ...findTextMatches(
          items.map((item) => item.str),
          term,
        ).map((match) => ({ ...match, page: p })),
      )
      scanned.value = p
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    if (hits.value.length) nextHit(1)
  } catch {
    if (serial === searchGeneration)
      error.value = 'Pencarian belum lengkap karena halaman gagal dibaca.'
  } finally {
    if (serial === searchGeneration) searching.value = false
  }
}
function nextHit(delta: number) {
  if (!hits.value.length) return
  activeHit.value = (activeHit.value + delta + hits.value.length) % hits.value.length
  const hit = hits.value[activeHit.value]!
  if (page.value !== hit.page) navigate(hit.page)
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
  hits.value = []
  searching.value = false
  highlight()
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
function startDrag(event: PointerEvent, index: number) {
  if (!props.editable) return
  const area = props.overlays![index]!
  drag = { index, startX: event.clientX, startY: event.clientY, x: area.x, y: area.y }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}
function moveDrag(event: PointerEvent) {
  if (!drag) return
  emit(
    'moved',
    drag.index,
    drag.x + (event.clientX - drag.startX) / width.value,
    drag.y + (event.clientY - drag.startY) / height.value,
  )
}
onMounted(() => {
  void load()
  resize = new ResizeObserver(() => {
    if (fit.value && !rendering.value) void render()
  })
  if (scroller.value) resize.observe(scroller.value)
})
onUnmounted(() => {
  disposed = true
  generation++
  renderGeneration++
  searchGeneration++
  fetchController?.abort()
  observer?.disconnect()
  resize?.disconnect()
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
        :disabled="page <= 1 || rendering"
        @click="navigate(page - 1)"
      >
        ←</button
      ><span>{{ t('Halaman :current / :count', { current: formatNumber(page), count: count ? formatNumber(count) : '…' }) }}</span
      ><button
        class="min-h-11 rounded border border-line px-3 disabled:opacity-40"
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
          :aria-label="t('Zoom')"
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
        class="min-h-11 min-w-0 flex-1 rounded border border-line px-3"
        :placeholder="t('Cari teks dalam PDF')"
        @input="clearSearch"
      /><button class="min-h-11 px-3 text-primary">{{ t('Cari') }}</button
      ><button
        type="button"
        class="min-h-11 px-2 disabled:opacity-40"
        :disabled="!hits.length"
        :aria-label="t('Hasil sebelumnya')"
        @click="nextHit(-1)"
      >
        ↑</button
      ><button
        type="button"
        class="min-h-11 px-2 disabled:opacity-40"
        :disabled="!hits.length"
        :aria-label="t('Hasil berikutnya')"
        @click="nextHit(1)"
      >
        ↓</button
      ><span role="status">{{
        searching
          ? t('Mencari :scanned/:count halaman · :hits hasil sementara', { scanned: formatNumber(scanned), count: formatNumber(count), hits: formatNumber(hits.length) })
          : t(':hits hasil:active', { hits: formatNumber(hits.length), active: activeHit >= 0 ? ` · ${formatNumber(activeHit + 1)}` : '' })
      }}</span>
    </form>
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
      {{ t('Halaman ini tidak memiliki lapisan teks yang dapat dicari. OCR belum tersedia.') }}
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
          class="absolute flex items-center justify-center overflow-hidden border-2 border-dashed border-primary bg-sage/60 text-center text-[10px] text-primary"
          :class="editable ? 'touch-none cursor-move' : 'pointer-events-none'"
          :style="{
            left: `${area.x * 100}%`,
            top: `${area.y * 100}%`,
            width: `${area.width * 100}%`,
            height: `${area.height * 100}%`,
          }"
          @pointerdown.stop="startDrag($event, area.index)"
          @pointermove="moveDrag"
          @pointerup="drag = undefined"
          @pointercancel="drag = undefined"
        >
          <img
            v-if="area.image"
            :src="area.image"
            :alt="t('Tanda tangan pilihan Anda')"
            class="h-full w-full object-contain"
          /><span v-else>{{ area.label || t('Tanda tangan') }}</span>
        </div>
        <div ref="bottom" class="absolute inset-x-0 bottom-0 h-px"></div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import type { Assignment, Placeholder } from '../../types/documents'
import { roundPosition, validPlaceholder } from '../../utils/documents'
import PdfViewer from './PdfViewer.vue'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import SelectControl from '../ui/SelectControl.vue'
import { confirmAction, notify } from '../../services/feedback'
import { formatNumber, t } from '../../services/workspace-language'
const props = defineProps<{
  versionGuid: string
  hash: string
  pages: number
  assignments: Assignment[]
  flush: () => Promise<boolean>
}>()
const emit = defineEmits<{
  saved: [assignments: Assignment[]]
  dirty: [dirty: boolean]
  reviewed: [reviewed: boolean]
}>()
const selected = ref(props.assignments[0]?.guid ?? '')
const auth = useAuthStore(),
  identity = auth.user?.guid
let active = true,
  blockedUntil = 0
onUnmounted(() => {
  active = false
})
const rows = ref<Record<string, Placeholder[]>>(
  Object.fromEntries(
    props.assignments.map((a) => [a.guid, (a.placeholders ?? []).map((p) => ({ ...p }))]),
  ),
)
const statuses = ref<Record<string, string>>({})
const changed = ref(new Set<string>()),
  reviewed = ref(false),
  busy = ref(false),
  pdfValid = ref(false),
  error = ref('')
const overlays = computed(() =>
  props.assignments.flatMap((a) =>
    (rows.value[a.guid] ?? []).map((p) => ({
      ...p,
      assignment: a.guid,
      label: `${formatNumber(a.sequence_number)}. ${a.recipient_email}`,
    })),
  ),
)
function mark(guid: string) {
  changed.value.add(guid)
  reviewed.value = false
  statuses.value[guid] = 'Belum tersimpan'
  emit('dirty', true)
  emit('reviewed', false)
}
function add(page: number, x = 0.1, y = 0.1) {
  const list = rows.value[selected.value]
  if (!list || list.length >= 100) return
  list.push({
    page_number: page,
    x: roundPosition(Math.min(0.75, Math.max(0, x))),
    y: roundPosition(Math.min(0.9, Math.max(0, y))),
    width: 0.25,
    height: 0.1,
  })
  mark(selected.value)
}
function moved(index: number, x: number, y: number) {
  const target = overlays.value[index]
  if (!target) return
  const group = rows.value[target.assignment]!
  const offset = overlays.value
    .slice(0, index)
    .filter((p) => p.assignment === target.assignment).length
  const p = group[offset]!
  p.x = roundPosition(Math.max(0, Math.min(1 - p.width, x)))
  p.y = roundPosition(Math.max(0, Math.min(1 - p.height, y)))
  mark(target.assignment)
}
async function save() {
  if (Date.now() < blockedUntil) {
    error.value = 'Terlalu banyak permintaan. Tunggu hingga pembatasan server berakhir.'
    return
  }
  if (busy.value || !pdfValid.value) return
  if (
    !props.assignments.every((a) =>
      (rows.value[a.guid] ?? []).every((p) => validPlaceholder(p, props.pages)),
    )
  ) {
    error.value = 'Area harus berukuran positif dan berada dalam halaman.'
    return
  }
  if (!(await confirmAction('Simpan posisi tanda tangan untuk semua penerima?', {
    title: 'Simpan posisi', action: 'Simpan',
  }))) return
  if (!(await props.flush())) return
  busy.value = true
  error.value = ''
  const updated: Assignment[] = []
  for (const assignment of props.assignments) {
    if (!active || auth.user?.guid !== identity) return
    if (Date.now() < blockedUntil) {
      statuses.value[assignment.guid] = 'Menunggu pembatasan server berakhir; belum tersimpan.'
      changed.value.add(assignment.guid)
      continue
    }
    try {
      statuses.value[assignment.guid] = 'Menyimpan…'
      const result = await documentsApi.placeholders(
        assignment.guid,
        rows.value[assignment.guid] ?? [],
      )
      if (!active || auth.user?.guid !== identity) return
      updated.push(result)
      rows.value[assignment.guid] = result.placeholders ?? []
      changed.value.delete(assignment.guid)
      statuses.value[assignment.guid] = 'Tersimpan'
    } catch (cause) {
      const feedback = workspaceError(cause)
      statuses.value[assignment.guid] = feedback.message
      if (feedback.retryAt) blockedUntil = feedback.retryAt
      changed.value.add(assignment.guid)
    }
  }
  busy.value = false
  emit('dirty', changed.value.size > 0)
  if (!changed.value.size) {
    emit('saved', updated)
    notify.success('Posisi tanda tangan tersimpan.')
  }
  else {
    reviewed.value = false
    emit('reviewed', false)
    error.value =
      'Sebagian posisi belum tersimpan. Periksa hasil setiap penerima sebelum melanjutkan.'
  }
}
function review() {
  emit('reviewed', reviewed.value && pdfValid.value && !changed.value.size)
}
function pdfFailure() {
  pdfValid.value = false
  reviewed.value = false
  emit('reviewed', false)
}
function updateArea(area: Placeholder, field: 'x' | 'y' | 'width' | 'height') {
  area[field] = roundPosition(Number(area[field]))
  mark(selected.value)
}
async function removeArea(index: number) {
  if (!(await confirmAction('Hapus area tanda tangan ini?', {
    title: 'Hapus area', action: 'Hapus', danger: true,
  }))) return
  rows.value[selected.value]!.splice(index, 1)
  mark(selected.value)
}
</script>
<template>
  <div class="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
    <div class="min-w-0">
      <p class="mb-3 text-sm text-muted">
        {{ t('Pilih penerima lalu klik halaman untuk menambah area. Geser area atau gunakan input posisi/ukuran.') }}
      </p>
      <PdfViewer
        :version-guid="versionGuid"
        :expected-hash="hash"
        :overlays="overlays"
        :editable="!busy"
        @place="add"
        @moved="moved"
        @ready="
          (actualHash, count) => {
            pdfValid = actualHash === hash && count === pages
          }
        "
        @failure="pdfFailure"
      />
    </div>
    <section class="min-w-0 rounded-xl border border-line bg-white p-4">
      <h2 class="mb-4 font-semibold">{{ t('Posisi tanda tangan') }}</h2>
      <FeedbackMessage :message="t(error)" error />
      <div class="grid gap-2 text-xs">
        {{ t('Penerima') }}
        <SelectControl
          v-model="selected"
          :aria-label="t('Penerima')"
          class="w-full min-h-11"
          :options="assignments.map((a) => ({
            value: a.guid,
            label: `${formatNumber(a.sequence_number)}. ${a.recipient_email}`,
          }))"
          :disabled="busy"
        />
      </div>
      <button
        class="my-3 min-h-11 text-sm text-primary underline"
        :disabled="busy || !pdfValid"
        @click="add(1)"
      >
        + {{ t('Area pada halaman :number', { number: 1 }) }}
      </button>
      <fieldset
        v-for="(area, index) in rows[selected]"
        :key="index"
        class="mb-4 grid grid-cols-2 gap-2 rounded border border-line p-3"
        :disabled="busy"
      >
        <legend class="px-1 text-xs">{{ t('Area :number', { number: formatNumber(index + 1) }) }}</legend>
        <label class="col-span-2 grid gap-1 text-xs"
          >{{ t('Halaman') }}<input
            v-model.number="area.page_number"
            type="number"
            min="1"
            :max="pages"
            class="min-h-11 w-full rounded border border-line px-2"
            @input="mark(selected)" /></label
        ><label
          v-for="field in ['x', 'y', 'width', 'height'] as const"
          :key="field"
          class="grid gap-1 text-xs"
          >{{ t(({ x: 'X', y: 'Y', width: 'Lebar', height: 'Tinggi' }[field])) }} (0–1)<input
            v-model.number="area[field]"
            type="number"
            min="0"
            max="1"
            step="0.001"
            class="min-h-11 w-full rounded border border-line px-2"
            @change="updateArea(area, field)" /></label
        ><button
          class="col-span-2 min-h-11 text-left text-xs text-error"
          @click="removeArea(index)"
        >
          {{ t('Hapus area') }}
        </button>
      </fieldset>
      <div v-for="a in assignments" :key="a.guid" class="my-3 text-xs wrap-anywhere">
        <p>
          {{ formatNumber(a.sequence_number) }}. {{ a.recipient_email }} · {{ t('Area :count', { count: formatNumber(rows[a.guid]?.length ?? 0) }) }}
        </p>
        <p class="mt-1 text-muted" role="status">
          {{
            t(statuses[a.guid] ||
            (a.placeholders?.some((p) => p.needs_review)
              ? 'Perlu ditinjau dan disimpan ulang'
              : 'Belum diubah'))
          }}
        </p>
      </div>
      <BaseButton class="mt-3 w-full" :loading="busy" :disabled="!pdfValid || busy" @click="save"
        >{{ t('Simpan semua posisi') }}</BaseButton
      ><label class="mt-4 flex items-start gap-2 text-xs leading-relaxed"
        ><input
          v-model="reviewed"
          type="checkbox"
          class="mt-1 accent-primary"
          :disabled="
            busy || !pdfValid || changed.size > 0 || !assignments.every((a) => rows[a.guid]?.length)
          "
          @change="review"
        />{{ t('Saya sudah meninjau seluruh posisi pada snapshot ini.') }}</label
      >
    </section>
  </div>
</template>

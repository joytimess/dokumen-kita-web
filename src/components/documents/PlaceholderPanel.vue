<script setup lang="ts">
import { computed, ref, onUnmounted, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import type { Assignment, Placeholder, SigningMode } from '../../types/documents'
import { roundPosition, validPlaceholder } from '../../utils/documents'
import { recipientColor } from '../../utils/signaturePlacement'
import PdfViewer from './PdfViewer.vue'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import SelectControl from '../ui/SelectControl.vue'
import { confirmAction, notify } from '../../services/feedback'
import { formatNumber, t } from '../../services/workspace-language'
const props = defineProps<{
  versionGuid: string; hash: string; pages: number; assignments: Assignment[]; signingMode?: SigningMode; flush: () => Promise<boolean>
}>()
const emit = defineEmits<{
  saved: [assignments: Assignment[]]; dirty: [dirty: boolean]; reviewed: [reviewed: boolean]
  manage: []; back: []; next: []
}>()
const viewer = ref<InstanceType<typeof PdfViewer>>()
const recipients = ref<Assignment[]>([...props.assignments].sort((a,b) => a.sequence_number - b.sequence_number))
const selected = ref(recipients.value[0]?.guid ?? '')
const selectedArea = ref<Placeholder | null>(null)
const currentPage = ref(1)
const auth = useAuthStore(), identity = auth.user?.guid
let active = true, blockedUntil = 0
onUnmounted(() => { active = false })
const rows = ref<Record<string, Placeholder[]>>(Object.fromEntries(
  recipients.value.map((a) => [a.guid, (a.placeholders ?? []).map((p) => ({ ...p }))]),
))
const statuses = ref<Record<string, string>>({})
const changed = ref(new Set<string>()), reviewed = ref(false), busy = ref(false), pdfValid = ref(false), error = ref('')
const canEdit = computed(() => !busy.value && pdfValid.value && auth.user?.guid === identity)
watch(() => [props.hash, props.versionGuid], () => { pdfFailure(); selectedArea.value = null })
watch(() => props.assignments, (assignments) => {
  recipients.value = [...assignments].sort((a,b) => a.sequence_number - b.sequence_number)
  for (const a of assignments) if (!changed.value.has(a.guid)) rows.value[a.guid] = (a.placeholders ?? []).map((p) => ({ ...p }))
  if (!assignments.some((a) => a.guid === selected.value)) selected.value = recipients.value[0]?.guid ?? ''
  if (selectedArea.value && !(rows.value[selected.value] ?? []).includes(selectedArea.value)) selectedArea.value = null
})
const overlays = computed(() => recipients.value.flatMap((a, colorIndex) =>
  (rows.value[a.guid] ?? []).map((p, index) => ({ ...p, area: p, assignment: a.guid,
    label: `${formatNumber(a.sequence_number)}. ${a.recipient_email} · ${t('Area :number', { number: formatNumber(index+1) })}`,
    color: recipientColor(colorIndex),
  })),
))
const selectedIndex = computed(() => overlays.value.findIndex((p) => p.area === selectedArea.value))
const issues = computed(() => recipients.value.flatMap((a) => (rows.value[a.guid] ?? [])
  .flatMap((p, index) => validPlaceholder(p, props.pages) ? [] : [t('Periksa area :area untuk penerima :recipient: halaman, posisi, atau ukurannya tidak valid.', { area: index+1, recipient: a.sequence_number })])))
const canReview = computed(() => pdfValid.value && !busy.value && !changed.value.size && !issues.value.length && recipients.value.length > 0 && recipients.value.every((a) => rows.value[a.guid]?.length && rows.value[a.guid]!.every((p) => !p.needs_review)))
function mark(guid: string) {
  changed.value.add(guid); reviewed.value = false; statuses.value[guid] = 'Belum tersimpan'
  emit('dirty', true); emit('reviewed', false)
}
function chooseRecipient(guid: string) { selected.value = guid; selectedArea.value = null }
function selectArea(index: number) {
  const target = overlays.value[index]
  if (!target) return
  selected.value = target.assignment; selectedArea.value = target.area
  viewer.value?.navigate(target.page_number)
}
function add(page: number, x = 0.1, y = 0.1) {
  if (!canEdit.value) return
  const list = rows.value[selected.value]
  if (!list || list.length >= 100) return
  list.push({ page_number: page, x: roundPosition(Math.min(0.75, Math.max(0, x))), y: roundPosition(Math.min(0.9, Math.max(0, y))), width: 0.25, height: 0.1 })
  selectedArea.value = list[list.length-1]!
  mark(selected.value)
}
function moved(index: number, x: number, y: number) {
  if (!canEdit.value) return
  const target = overlays.value[index]
  if (!target) return
  target.area.x = roundPosition(Math.max(0, Math.min(1-target.width, x)))
  target.area.y = roundPosition(Math.max(0, Math.min(1-target.height, y)))
  mark(target.assignment)
}
function resized(index: number, geometry: Pick<Placeholder,'x'|'y'|'width'|'height'>) {
  const target = overlays.value[index]
  if (!canEdit.value || !target) return
  Object.assign(target.area, geometry); mark(target.assignment)
}
function reassign(value: string | number) {
  const guid = String(value)
  const area = selectedArea.value
  if (!canEdit.value || !area || guid === selected.value || !rows.value[guid]) return
  if (rows.value[guid]!.length >= 100) { error.value = 'Satu penerima maksimal memiliki 100 area.'; return }
  const source = selected.value, list = rows.value[source]!
  list.splice(list.indexOf(area), 1); rows.value[guid]!.push(area)
  selected.value = guid; mark(source); mark(guid)
}
function coordinate(field: 'x'|'y'|'width'|'height', event: Event) {
  if (!selectedArea.value || !canEdit.value) return
  selectedArea.value[field] = roundPosition(Number((event.target as HTMLInputElement).value) / 100)
  mark(selected.value)
}
function areaPage(value: string | number) {
  if (!selectedArea.value || !canEdit.value) return
  selectedArea.value.page_number = Number(value); mark(selected.value); viewer.value?.navigate(Number(value))
}
async function removeArea() {
  const area = selectedArea.value, guid = selected.value
  if (!canEdit.value || !area || !(await confirmAction('Hapus area tanda tangan ini?', { title: 'Hapus area', action: 'Hapus', danger: true }))) return
  rows.value[guid]!.splice(rows.value[guid]!.indexOf(area),1); selectedArea.value = null; mark(guid)
}
async function updateRecipients(next: Assignment[], removed?: Assignment) {
  if (busy.value || auth.user?.guid !== identity) return
  if (!(await confirmAction(removed ? 'Menghapus penerima juga menghapus semua posisi tanda tangannya. Lanjutkan?' : 'Simpan perubahan penerima dan urutannya?', {title: removed ? 'Hapus penerima' : 'Simpan penerima', action: removed ? 'Hapus' : 'Simpan', danger: !!removed}))) return
  if (!(await props.flush())) return
  const previous = recipients.value
  busy.value = true; error.value = ''; reviewed.value = false; emit('reviewed', false); emit('dirty', true)
  recipients.value = next.map((a,index) => ({...a, sequence_number:index+1}))
  try {
    const result = await documentsApi.signers(props.versionGuid, next.map((a) => a.recipient_email))
    if (!active || auth.user?.guid !== identity) return
    if (removed) { delete rows.value[removed.guid]; changed.value.delete(removed.guid); selectedArea.value = null }
    emit('saved', result.assignments ?? [])
    notify.success('Penerima tersimpan.')
  } catch (cause) {
    if (active && auth.user?.guid === identity) { recipients.value = previous; error.value = workspaceError(cause).message }
  } finally { busy.value = false; if (active) emit('dirty', changed.value.size > 0) }
}
function reorder(index: number, delta: number) {
  if (props.signingMode === 'parallel') return
  const next = [...recipients.value], [item] = next.splice(index,1)
  if (!item || index+delta < 0 || index+delta >= recipients.value.length) return
  next.splice(index+delta,0,item); void updateRecipients(next)
}
async function save() {
  if (Date.now() < blockedUntil) {
    error.value = 'Terlalu banyak permintaan. Tunggu hingga pembatasan server berakhir.'
    return
  }
  if (!canEdit.value) return
  if (
    !recipients.value.every((a) =>
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
  for (const assignment of recipients.value) {
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
  selectedArea.value = null
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

function review() { emit('reviewed', reviewed.value && canReview.value) }
function pdfFailure() { pdfValid.value = false; reviewed.value = false; emit('reviewed', false) }
</script>
<template>
  <div class="grid min-w-0 gap-4">
    <div class="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div class="min-w-0">
        <PdfViewer ref="viewer" :version-guid="versionGuid" :expected-hash="hash" :overlays="overlays" :editable="canEdit" :selected-overlay="selectedIndex"
          @place="add" @moved="moved" @selected="selectArea" @resized="resized" @page="currentPage = $event"
          @ready="(actualHash,count) => { pdfValid = actualHash === hash && count === pages }" @failure="pdfFailure" />
        <p class="mt-2 text-xs text-muted">{{ t(':count area · Halaman :page dari :pages', {count:overlays.length,page:currentPage,pages}) }}</p>
      </div>
      <details open class="min-w-0 rounded-xl border border-line bg-white lg:sticky lg:top-4">
        <summary class="cursor-pointer px-4 py-3 text-sm font-semibold text-primary lg:hidden">{{ t('Penerima dan properti area') }}</summary>
        <div class="grid gap-5 p-4 lg:max-h-[78dvh] lg:overflow-y-auto">
          <section>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="font-semibold">{{ t('Penerima tanda tangan') }}</h2>
              <button type="button" class="min-h-11 text-xs text-primary underline disabled:opacity-40" :disabled="busy" @click="emit('manage')">{{ t('Kelola penerima') }}</button>
            </div>
            <p class="mb-3 text-xs leading-5 text-muted">{{ t('Pilih penerima, lalu klik halaman PDF untuk menambah area tanda tangan.') }}</p>
            <ol class="grid list-none gap-2 p-0">
              <li v-for="(recipient,index) in recipients" :key="recipient.guid" class="rounded-lg border p-3" :style="{borderColor:selected === recipient.guid ? recipientColor(index) : 'var(--color-line)'}">
                <button type="button" class="flex w-full items-start gap-2 text-left disabled:opacity-50" :disabled="!canEdit" :aria-pressed="selected === recipient.guid" @click="chooseRecipient(recipient.guid)">
                  <span class="grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold" :style="{color:recipientColor(index),borderColor:recipientColor(index)}">{{ formatNumber(recipient.sequence_number) }}</span>
                  <span class="min-w-0 flex-1"><span class="block break-words text-sm font-semibold">{{ recipient.recipient_email }}</span><span class="mt-1 block text-xs text-muted"><template v-if="signingMode !== 'parallel'">{{ t('Urutan :number', {number:recipient.sequence_number}) }} · </template>{{ t(':count area', {count:rows[recipient.guid]?.length ?? 0}) }}</span></span>
                </button>
                <div class="mt-2 flex flex-wrap items-center justify-between gap-1">
                  <span class="text-xs text-muted" role="status">{{ t(statuses[recipient.guid] || (rows[recipient.guid]?.some(p => p.needs_review) ? 'Perlu ditinjau dan disimpan ulang' : 'Belum diubah')) }}</span>
                  <div class="ml-auto flex">
                    <button v-if="signingMode !== 'parallel'" type="button" class="placement-icon" :aria-label="t('Naikkan penerima :number', {number:index+1})" :disabled="busy || index===0" @click="reorder(index,-1)"><span class="material-symbols-outlined" aria-hidden="true">arrow_upward</span></button>
                    <button v-if="signingMode !== 'parallel'" type="button" class="placement-icon" :aria-label="t('Turunkan penerima :number', {number:index+1})" :disabled="busy || index===recipients.length-1" @click="reorder(index,1)"><span class="material-symbols-outlined" aria-hidden="true">arrow_downward</span></button>
                    <button type="button" class="placement-icon text-error" :aria-label="t('Hapus penerima :number', {number:index+1})" :disabled="busy" @click="updateRecipients(recipients.filter(a => a.guid !== recipient.guid), recipient)"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
                  </div>
                </div>
              </li>
            </ol>
            <button type="button" class="mt-3 min-h-11 w-full rounded-lg border border-primary px-3 text-sm text-primary disabled:opacity-40" :disabled="busy" @click="emit('manage')">+ {{ t('Tambah penerima') }}</button>
          </section>
          <FeedbackMessage :message="t(error)" error />
          <ul v-if="issues.length" class="list-disc pl-4 text-xs leading-5 text-error" role="alert"><li v-for="issue in issues" :key="issue">{{ issue }}</li></ul>
          <section class="border-t border-line pt-4">
            <div class="mb-3 flex items-center justify-between gap-2"><h2 class="font-semibold">{{ t('Properti area tanda tangan') }}</h2><button v-if="selectedArea" type="button" class="placement-icon" :aria-label="t('Tutup properti')" @click="selectedArea = null"><span class="material-symbols-outlined" aria-hidden="true">close</span></button></div>
            <div v-if="selectedArea" class="grid gap-3">
              <p class="rounded-lg bg-sage p-3 text-xs text-primary">{{ t('Area :number', {number:(rows[selected]?.indexOf(selectedArea) ?? 0)+1}) }} · {{ t('Area ini ditugaskan kepada penerima yang dipilih.') }}</p>
              <label class="grid gap-1 text-xs">{{ t('Penerima') }}<SelectControl :model-value="selected" :options="recipients.map(a => ({value:a.guid,label:`${a.sequence_number}. ${a.recipient_email}`}))" :ariaLabel="t('Penerima area')" :disabled="!canEdit" @change="reassign" /></label>
              <label class="grid gap-1 text-xs">{{ t('Halaman') }}<SelectControl :model-value="selectedArea.page_number" :options="Array.from({length:pages},(_,i)=>({value:i+1,label:t('Halaman :number',{number:i+1})}))" :ariaLabel="t('Halaman area')" :disabled="!canEdit" @change="areaPage" /></label>
              <details class="rounded-lg border border-line p-3"><summary class="cursor-pointer text-xs font-semibold text-primary">{{ t('Posisi dan ukuran lanjutan') }}</summary><fieldset :disabled="!canEdit" class="mt-3 grid grid-cols-2 gap-2"><label v-for="field in (['x','y','width','height'] as const)" :key="field" class="grid gap-1 text-xs">{{ t(({x:'Posisi X',y:'Posisi Y',width:'Lebar',height:'Tinggi'}[field])) }} (%)<input type="number" :aria-label="t(({x:'Posisi X',y:'Posisi Y',width:'Lebar',height:'Tinggi'}[field]))" :value="roundPosition(selectedArea[field]*100)" min="0" max="100" step="0.1" class="min-h-11 w-full rounded border border-line px-2" @change="coordinate(field,$event)"></label></fieldset></details>
              <button type="button" class="min-h-11 rounded-lg border border-error/30 text-sm text-error disabled:opacity-40" :disabled="!canEdit" @click="removeArea">{{ t('Hapus area') }}</button>
            </div>
            <p v-else class="text-sm leading-6 text-muted">{{ t('Klik area tanda tangan untuk memilihnya. Geser untuk memindahkan, lalu tarik sudutnya untuk mengubah ukuran.') }}</p>
            <div class="mt-4 grid gap-2"><button v-for="(area,index) in rows[selected]" :key="index" type="button" class="min-h-11 rounded-lg border border-line px-3 text-left text-xs hover:bg-sage disabled:opacity-40" :disabled="!canEdit" @click="selectArea(overlays.findIndex(p => p.area === area))">{{ t('Area :number', {number:index+1}) }} · {{ t('Halaman :number', {number:area.page_number}) }}</button></div>
            <button type="button" class="mt-3 min-h-11 w-full rounded-lg border border-primary text-sm text-primary disabled:opacity-40" :disabled="!canEdit || (rows[selected]?.length ?? 0)>=100" @click="add(currentPage)">+ {{ t('Area pada halaman :number',{number:currentPage}) }}</button>
          </section>
          <section class="grid gap-3 border-t border-line pt-4">
            <p class="text-xs leading-5 text-muted">{{ t('Simpan draft menyimpan isi dokumen. Simpan posisi menyimpan area dan penerimanya.') }}</p>
            <BaseButton :loading="busy" :disabled="!canEdit || !!issues.length" @click="save">{{ t('Simpan semua posisi') }}</BaseButton>
            <p v-if="!recipients.every(a => rows[a.guid]?.length)" class="text-xs text-muted">{{ t('Tambahkan setidaknya satu area untuk setiap penerima sebelum melanjutkan.') }}</p>
            <label class="flex items-start gap-2 text-xs leading-5"><input v-model="reviewed" type="checkbox" class="mt-1 accent-primary" :disabled="!canReview" @change="review">{{ t('Saya sudah meninjau seluruh posisi pada snapshot ini.') }}</label>
          </section>
        </div>
      </details>
    </div>
    <footer class="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white p-4">
      <p class="text-xs leading-5 text-muted">{{ t('Pilih penerima → Tambah area → Geser atau ubah ukuran → Simpan posisi → Tinjau.') }}</p>
      <div class="ml-auto flex gap-2"><button type="button" class="min-h-11 rounded-lg border border-line px-4 text-sm text-primary disabled:opacity-40" :disabled="busy" @click="emit('back')">{{ t('Kembali') }}</button><BaseButton :disabled="!reviewed || !canReview" @click="emit('next')">{{ t('Lanjut ke Tinjau') }} →</BaseButton></div>
    </footer>
  </div>
</template>
<style scoped>
.placement-icon { display:grid; width:2.75rem; height:2.75rem; place-items:center; border-radius:.5rem; color:var(--color-primary); }
.placement-icon:hover { background:var(--color-sage); }
.placement-icon:disabled { cursor:not-allowed; opacity:.35; }
.placement-icon:focus-visible { outline:2px solid var(--color-primary); outline-offset:2px; }
.placement-icon.text-error { color:var(--color-error); }
.placement-icon .material-symbols-outlined { font-size:18px; }
</style>

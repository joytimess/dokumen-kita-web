<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import flatpickr from 'flatpickr'
import type { Instance } from 'flatpickr/dist/types/instance'
import 'flatpickr/dist/flatpickr.css'
import { t } from '../../services/workspace-language'

const props = defineProps<{ from: string; to: string }>()
const emit = defineEmits<{ apply: [from: string, to: string] }>()
const root = ref<HTMLElement>()
const calendar = ref<HTMLInputElement>()
const trigger = ref<HTMLButtonElement>()
const open = ref(false)
const draft = ref<string[]>([])
const id = useId()
let picker: Instance | undefined

async function toggle() {
  if (open.value) return cancel()
  open.value = true
  await nextTick()
  if (!open.value || !calendar.value) return
  if (!picker) picker = flatpickr(calendar.value, {
    mode: 'range', inline: true, dateFormat: 'Y-m-d', showMonths: 1,
    monthSelectorType: 'dropdown', locale: { firstDayOfWeek: 0 },
    defaultDate: [props.from, props.to].filter(Boolean),
    onChange: (dates, _value, instance) => {
      draft.value = dates.map((date) => instance.formatDate(date, 'Y-m-d'))
    },
  })
  picker.setDate([props.from, props.to].filter(Boolean))
  draft.value = picker.selectedDates.map((date) => picker!.formatDate(date, 'Y-m-d'))
}
function cancel() {
  open.value = false
  draft.value = []
}
function apply() {
  if (draft.value.length !== 2) return
  emit('apply', draft.value[0]!, draft.value[1]!)
  cancel()
  trigger.value?.focus()
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) cancel()
}
function escape(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    cancel()
    trigger.value?.focus()
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', outside)
  document.addEventListener('keydown', escape)
})
onBeforeUnmount(() => {
  picker?.destroy()
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('keydown', escape)
})
</script>

<template>
  <div ref="root" class="history-date-range relative flex items-center gap-2">
    <button ref="trigger" type="button" class="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-xs" :aria-expanded="open" :aria-controls="id" aria-haspopup="dialog" @click="toggle">
      <svg v-if="!from && !to" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4m8-4v4"/></svg>
      {{ from || to ? `${from || to} -> ${to || from}` : t('Rentang tanggal') }}
      <span v-if="from || to" aria-hidden="true">⌄</span>
    </button>
    <button v-if="from || to" type="button" class="min-h-11 px-2 text-muted" :aria-label="t('Hapus filter tanggal')" @click="cancel(); emit('apply', '', '')">×</button>
    <Transition name="workspace-dropdown">
      <div v-show="open" :id="id" role="dialog" aria-label="Select Date Range" :inert="!open" class="history-calendar absolute right-0 top-full z-30 mt-2 origin-top-right rounded-xl border border-line bg-white p-3 shadow-xl">
        <p class="mb-3 px-1 text-xs font-semibold text-muted">Select Date Range</p>
        <input ref="calendar" class="hidden" aria-label="Date range" />
        <div class="mt-3 flex justify-end gap-3 text-sm">
          <button type="button" class="min-h-9 px-2" @click="cancel(); trigger?.focus()">Cancel</button>
          <button type="button" class="min-h-9 rounded-lg bg-primary px-4 font-semibold text-white disabled:opacity-40" :disabled="draft.length !== 2" @click="apply">Apply</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.history-calendar { width: 334px; max-width: calc(100vw - 2.5rem); }
.history-calendar :deep(.flatpickr-calendar) { width: 100%; border: 1px solid #dedede; border-radius: 12px; padding: 16px 8px; box-shadow: 0 1px 4px #00000018; }
.history-calendar :deep(.flatpickr-calendar.inline) { top: 0; }
.history-calendar :deep(.flatpickr-innerContainer),
.history-calendar :deep(.flatpickr-rContainer),
.history-calendar :deep(.flatpickr-days),
.history-calendar :deep(.dayContainer) { width: 100%; min-width: 0; max-width: 100%; }
.history-calendar :deep(.flatpickr-months) { margin-bottom: 12px; position: relative; }
.history-calendar :deep(.flatpickr-prev-month),
.history-calendar :deep(.flatpickr-next-month) { top: 0; }
.history-calendar :deep(.flatpickr-current-month) { font-size: 14px; }
.history-calendar :deep(.flatpickr-monthDropdown-months) { border: 1px solid #aaa; border-radius: 7px; font-weight: 400; }
.history-calendar :deep(.numInputWrapper) { margin-left: 5px; }
.history-calendar :deep(.flatpickr-weekday) { color: #888; font-size: 11px; font-weight: 400; }
.history-calendar :deep(.dayContainer) { justify-content: flex-start; }
.history-calendar :deep(.flatpickr-day) { flex-basis: calc(100% / 7 - 4px); max-width: calc(100% / 7 - 4px); margin: 2px; height: 34px; line-height: 32px; border-radius: 9px; font-size: 12px; }
.history-calendar :deep(.flatpickr-day.today) { border-color: #999; }
.history-calendar :deep(.flatpickr-day.inRange) { background: #e8e8e8; border-color: #e8e8e8; box-shadow: none; }
.history-calendar :deep(.flatpickr-day:hover) { background: #ddd; border-color: #ddd; }
.history-calendar :deep(.flatpickr-day.selected),
.history-calendar :deep(.flatpickr-day.startRange),
.history-calendar :deep(.flatpickr-day.endRange) { background: var(--color-primary); color: white; border-color: #72a8c0; border-radius: 9px; box-shadow: none; }
.history-calendar :deep(.flatpickr-day.prevMonthDay),
.history-calendar :deep(.flatpickr-day.nextMonthDay) { color: #c7c7c7; }
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Assignment, SigningMode } from '../../types/documents'
import { validSigners } from '../../utils/documents'
import { documentsApi } from '../../services/documents.service'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import SelectControl from '../ui/SelectControl.vue'
import { confirmAction, notify } from '../../services/feedback'
import { formatNumber, t } from '../../services/workspace-language'
const props = defineProps<{
  versionGuid: string
  assignments: Assignment[]
  signingMode?: SigningMode
  readonly?: boolean
  flush: () => Promise<boolean>
}>()
const emit = defineEmits<{ saved: [continueToNext: boolean]; dirty: [value: boolean] }>()
const emails = ref<string[]>([])
const mode = ref<SigningMode>('sequential')
const baseline = ref('')
const configuration = () => JSON.stringify({ emails: emails.value, mode: mode.value })
const localError = ref('')
const { busy, error, fields, run } = useWorkspaceRequest()
watch(
  () => [props.assignments, props.signingMode] as const,
  ([value, signingMode]) => {
    if (baseline.value && configuration() !== baseline.value) return
    emails.value = [...value]
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .map((a) => a.recipient_email)
    mode.value = signingMode ?? 'sequential'
    baseline.value = configuration()
  },
  { immediate: true },
)
const dirty = computed(() => configuration() !== baseline.value)
watch(dirty, (value) => emit('dirty', value))
async function remove(index: number) {
  const assignment = props.assignments.find((a) => a.recipient_email === emails.value[index])
  if (
    !(await confirmAction(
      assignment?.placeholders?.length
        ? 'Menghapus penerima juga menghapus semua posisi tanda tangannya. Lanjutkan?'
        : 'Hapus penerima dari daftar?',
      { title: 'Hapus penerima', action: 'Hapus', danger: true },
    ))
  )
    return
  emails.value.splice(index, 1)
}
function move(index: number, delta: number) {
  if (mode.value === 'parallel' || props.readonly || busy.value) return
  const value = emails.value.splice(index, 1)[0]!
  emails.value.splice(index + delta, 0, value)
}
const dragIndex = ref(-1)
function drop(index: number) {
  if (dragIndex.value >= 0 && !busy.value) move(dragIndex.value, index - dragIndex.value)
  dragIndex.value = -1
}
async function save(continueToNext = false) {
  if (props.readonly || busy.value) return
  localError.value = ''
  if (!validSigners(emails.value)) {
    localError.value = 'Gunakan email valid dan unik, maksimal 50 penerima.'
    return
  }
  const removed = props.assignments.filter(
    (a) =>
      a.placeholders?.length &&
      !emails.value.some((e) => e.trim().toLowerCase() === a.recipient_email),
  )
  if (
    !(await confirmAction(
      removed.length
        ? 'Perubahan email akan menghapus posisi penerima lama. Simpan perubahan?'
        : mode.value === 'parallel' ? 'Simpan perubahan penerima dan metode penandatanganan?' : 'Simpan perubahan penerima dan urutannya?',
      { title: 'Simpan penerima', action: 'Simpan', danger: !!removed.length },
    ))
  )
    return
  if (!(await props.flush())) return
  const result = await run(() => documentsApi.signers(props.versionGuid, emails.value, mode.value))
  if (result) {
    baseline.value = configuration()
    emit('saved', continueToNext)
    notify.success('Penerima tersimpan.')
  }
}
</script>
<template>
  <section class="rounded-xl border border-line bg-white p-4 sm:p-6">
    <fieldset class="min-w-0" :disabled="readonly || busy">
    <header class="flex items-start gap-3">
      <span class="material-symbols-outlined mt-0.5 text-xl text-primary" aria-hidden="true"
        >group</span
      >
      <div>
        <h2 class="text-lg font-semibold">{{ t('Penerima tanda tangan') }}</h2>
        <p class="mt-1 text-sm leading-6 text-muted">
          {{ t(mode === 'parallel' ? 'Tambahkan penerima undangan yang dapat menandatangani secara independen.' : 'Tambahkan penerima undangan dan tentukan urutan mereka menandatangani dokumen.') }}
        </p>
      </div>
    </header>
    <div class="mt-5 grid gap-2">
      <label class="text-sm font-semibold">{{ t('Metode Penandatanganan') }}</label>
      <p v-if="readonly" class="text-sm">{{ t(mode === 'parallel' ? 'Parallel (Bebas Urutan)' : 'Sequential (Berurutan)') }}</p>
      <SelectControl v-else v-model="mode" :options="[
        { value: 'sequential', label: t('Sequential (Berurutan)') },
        { value: 'parallel', label: t('Parallel (Bebas Urutan)') },
      ]" :ariaLabel="t('Metode Penandatanganan')" :disabled="busy" />
    </div>
    <div class="mt-5 rounded-lg border border-line bg-soft p-4">
      <p class="flex items-center gap-2 text-sm font-semibold text-primary">
        <span class="material-symbols-outlined text-lg" aria-hidden="true">info</span>
        {{ t(mode === 'parallel' ? 'Tanda tangan bebas urutan' : 'Tanda tangan berurutan') }}
      </p>
      <p class="mt-2 text-sm leading-6 text-muted">
        {{
          t(
            mode === 'parallel'
              ? 'Semua penerima dapat menandatangani tanpa menunggu satu sama lain. Undangan dikirim kepada seluruh penerima setelah publish.'
              : 'Undangan dikirim kepada penerima pertama. Penerima berikutnya baru mendapatkan undangan setelah giliran sebelumnya selesai.',
          )
        }}
      </p>
    </div>
    <div class="mt-5 border-t border-line pt-5">
      <div class="mb-4 flex items-center justify-between gap-3">
        <h3 class="text-sm font-semibold">{{ t('Daftar penerima') }}</h3>
        <span class="text-xs text-muted">{{
          t(':count penerima', { count: formatNumber(emails.length) })
        }}</span>
      </div>
      <FeedbackMessage :message="t(localError || error)" error />
      <p v-for="(message, key) in fields" :key="key" class="mb-2 text-xs text-error">
        {{ message }}
      </p>
      <ol class="m-0 list-none p-0">
        <li v-for="(_, index) in emails" :key="index" class="min-w-0">
          <div
            class="rounded-xl border border-line bg-white p-4"
            :draggable="!busy && !readonly && mode === 'sequential'"
            @dragstart="dragIndex = index"
            @dragover.prevent
            @drop.prevent="drop(index)"
          >
            <div
              class="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"
            >
              <span
                class="grid size-10 shrink-0 place-items-center rounded-lg bg-sage text-sm font-semibold text-primary"
                >{{ formatNumber(index + 1) }}</span
              >
              <div class="min-w-0 flex-1">
                <h4 class="text-sm font-semibold">
                  {{
                    t(
                      mode === 'parallel' ? 'Penerima :number' : index === 0
                        ? 'Penerima pertama'
                        : index === 1
                          ? 'Penerima kedua'
                          : 'Penerima ke-:number',
                      { number: formatNumber(index + 1) },
                    )
                  }}
                </h4>
                <p class="mt-1 text-xs leading-5 text-muted">
                  {{
                    mode === 'parallel' ? t('Dapat menandatangani setelah publish') : index === 0
                      ? t('Menandatangani terlebih dahulu')
                      : t('Menandatangani setelah penerima :number', {
                          number: formatNumber(index),
                        })
                  }}
                </p>
              </div>
              <span
                class="col-start-2 justify-self-start rounded-full bg-sage px-2.5 py-1 text-[11px] font-semibold text-primary sm:col-start-3 sm:row-start-1 sm:justify-self-end"
                >{{ t(mode === 'parallel' ? 'Bebas urutan' : index === 0 ? 'Pertama' : 'Menunggu giliran') }}</span
              >
            </div>
            <label class="mt-4 grid min-w-0 gap-2 text-xs font-medium"
              ><span>{{ t('Email penerima') }}</span>
              <span class="relative block">
                <span
                  class="material-symbols-outlined pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-lg text-muted"
                  aria-hidden="true"
                  >mail</span
                >
                <input
                  v-model="emails[index]"
                  type="email"
                  maxlength="255"
                  class="min-h-12 w-full min-w-0 rounded-lg border border-line bg-white pr-3 pl-10 text-sm font-normal text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"
                  :aria-label="t('Email penerima :number', { number: formatNumber(index + 1) })"
                  :placeholder="index === 0 ? 'nama@email.com' : 'penerima@email.com'"
                  :disabled="busy" /></span
            ></label>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p v-if="mode === 'sequential'" class="text-xs text-muted">
                {{
                  index === 0
                    ? t('Urutan tidak dapat dinaikkan')
                    : index === emails.length - 1
                      ? t('Urutan tidak dapat diturunkan')
                      : t('Sesuaikan urutan penerima')
                }}
              </p>
              <div class="ml-auto flex gap-2">
                <button
                  v-if="mode === 'sequential'"
                  type="button"
                  class="grid size-11 place-items-center rounded-lg border border-line text-primary transition-colors hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
                  :disabled="busy || index === 0"
                  :aria-label="t('Naikkan penerima :number', { number: formatNumber(index + 1) })"
                  @click="move(index, -1)"
                >
                  <span class="material-symbols-outlined text-lg" aria-hidden="true"
                    >arrow_upward</span
                  ></button
                ><button
                  v-if="mode === 'sequential'"
                  type="button"
                  class="grid size-11 place-items-center rounded-lg border border-line text-primary transition-colors hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
                  :disabled="busy || index === emails.length - 1"
                  :aria-label="t('Turunkan penerima :number', { number: formatNumber(index + 1) })"
                  @click="move(index, 1)"
                >
                  <span class="material-symbols-outlined text-lg" aria-hidden="true"
                    >arrow_downward</span
                  ></button
                ><button
                  type="button"
                  class="grid size-11 place-items-center rounded-lg border border-line text-error transition-colors hover:bg-error/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
                  :aria-label="t('Hapus penerima :number', { number: formatNumber(index + 1) })"
                  :disabled="busy"
                  @click="remove(index)"
                >
                  <span class="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
                </button>
              </div>
            </div>
          </div>
          <div
            v-if="mode === 'sequential' && index < emails.length - 1"
            class="flex flex-col items-center gap-1 py-3 text-center text-xs text-muted"
            aria-hidden="true"
          >
            <span class="material-symbols-outlined text-lg">south</span>
            <span>{{
              t('Setelah penerima :number selesai tanda tangan', {
                number: formatNumber(index + 1),
              })
            }}</span>
          </div>
        </li>
      </ol>
      <p v-if="!emails.length" class="mb-4 text-sm text-muted">{{ t('Belum ada penerima.') }}</p>
      <div class="mt-4">
        <button
          type="button"
          class="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
          :disabled="busy || emails.length >= 50"
          @click="emails.push('')"
        >
          <span class="material-symbols-outlined text-lg" aria-hidden="true">add</span
          >{{ t('Tambah penerima') }}
        </button>
      </div>
    </div>
    <footer
      class="mt-5 flex flex-col gap-4 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="text-xs leading-5" aria-live="polite">
        <p class="font-semibold" :class="dirty ? 'text-primary' : 'text-muted'">
          {{
            t(
              dirty
                ? 'Perubahan penerima belum tersimpan.'
                : emails.length
                  ? 'Penerima tersimpan.'
                  : 'Belum ada penerima.',
            )
          }}
        </p>
        <p v-if="dirty" class="text-muted">{{ t('Simpan untuk memperbarui daftar penerima.') }}</p>
      </div>
      <div class="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
        <button
          type="button"
          class="inline-flex min-h-12 items-center justify-center rounded-[7px] border border-primary bg-white px-5 py-3 text-center text-sm font-semibold text-primary transition-colors hover:bg-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait disabled:opacity-65 motion-reduce:transition-none"
          :disabled="busy"
          :aria-busy="busy"
          @click="save()"
        >
          {{ t('Simpan perubahan') }}
        </button>
        <BaseButton :loading="busy" class="w-full" @click="save(true)">
          {{ t('Simpan Penerima dan Step Selanjutnya') }}
        </BaseButton>
      </div>
    </footer>
    </fieldset>
  </section>
</template>

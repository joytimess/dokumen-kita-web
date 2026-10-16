<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Assignment } from '../../types/documents'
import { validSigners } from '../../utils/documents'
import { documentsApi } from '../../services/documents.service'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import { confirmAction, notify } from '../../services/feedback'
const props = defineProps<{
  versionGuid: string
  assignments: Assignment[]
  flush: () => Promise<boolean>
}>()
const emit = defineEmits<{ saved: []; dirty: [value: boolean] }>()
const emails = ref<string[]>([])
const baseline = ref('')
const localError = ref('')
const { busy, error, fields, run } = useWorkspaceRequest()
watch(
  () => props.assignments,
  (value) => {
    if (baseline.value && JSON.stringify(emails.value) !== baseline.value) return
    emails.value = [...value]
      .sort((a, b) => a.sequence_number - b.sequence_number)
      .map((a) => a.recipient_email)
    baseline.value = JSON.stringify(emails.value)
  },
  { immediate: true },
)
const dirty = computed(() => JSON.stringify(emails.value) !== baseline.value)
watch(dirty, (value) => emit('dirty', value))
async function remove(index: number) {
  const assignment = props.assignments.find((a) => a.recipient_email === emails.value[index])
  if (!(await confirmAction(
    assignment?.placeholders?.length
      ? 'Menghapus penerima juga menghapus semua posisi tanda tangannya. Lanjutkan?'
      : 'Hapus penerima dari daftar?',
    { title: 'Hapus penerima', action: 'Hapus', danger: true },
  ))) return
  emails.value.splice(index, 1)
}
function move(index: number, delta: number) {
  const value = emails.value.splice(index, 1)[0]!
  emails.value.splice(index + delta, 0, value)
}
const dragIndex = ref(-1)
function drop(index: number) {
  if (dragIndex.value >= 0 && !busy.value) move(dragIndex.value, index - dragIndex.value)
  dragIndex.value = -1
}
async function save() {
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
  if (!(await confirmAction(
    removed.length
      ? 'Perubahan email akan menghapus posisi penerima lama. Simpan perubahan?'
      : 'Simpan perubahan penerima dan urutannya?',
    { title: 'Simpan penerima', action: 'Simpan', danger: !!removed.length },
  ))) return
  if (!(await props.flush())) return
  const result = await run(() => documentsApi.signers(props.versionGuid, emails.value))
  if (result) {
    baseline.value = JSON.stringify(emails.value)
    emit('saved')
    notify.success('Penerima tersimpan.')
  }
}
</script>
<template>
  <section class="rounded-xl border border-line bg-white p-4 sm:p-6">
    <h2 class="text-xl font-semibold">Penerima dan urutan</h2>
    <p class="mt-2 mb-6 text-sm text-muted">
      Penerima pertama menandatangani lebih dulu. Email Anda sendiri juga dapat ditambahkan.
    </p>
    <FeedbackMessage :message="localError || error" error />
    <p v-for="(message, key) in fields" :key="key" class="mb-2 text-xs text-error">{{ message }}</p>
    <div
      v-for="(_, index) in emails"
      :key="index"
      class="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line p-3"
      :draggable="!busy"
      @dragstart="dragIndex = index"
      @dragover.prevent
      @drop.prevent="drop(index)"
    >
      <span class="text-xs text-muted">{{ index + 1 }}.</span
      ><label class="min-w-0 flex-1"
        ><span class="sr-only">Email penerima {{ index + 1 }}</span
        ><input
          v-model="emails[index]"
          type="email"
          maxlength="255"
          class="min-h-11 w-full min-w-0 rounded border border-line px-3 text-sm"
          :disabled="busy"
      /></label>
      <div class="flex gap-1">
        <button
          class="min-h-11 min-w-11 rounded border border-line disabled:opacity-30"
          :disabled="busy || index === 0"
          :aria-label="`Naikkan penerima ${index + 1}`"
          @click="move(index, -1)"
        >
          ↑</button
        ><button
          class="min-h-11 min-w-11 rounded border border-line disabled:opacity-30"
          :disabled="busy || index === emails.length - 1"
          :aria-label="`Turunkan penerima ${index + 1}`"
          @click="move(index, 1)"
        >
          ↓</button
        ><button class="min-h-11 px-2 text-xs text-error" :disabled="busy" @click="remove(index)">
          Hapus
        </button>
      </div>
    </div>
    <p v-if="!emails.length" class="mb-4 text-sm text-muted">Belum ada penerima.</p>
    <div class="mt-5 flex flex-wrap gap-3">
      <button
        class="min-h-11 rounded-lg border border-line px-4 text-sm text-primary disabled:opacity-40"
        :disabled="busy || emails.length >= 50"
        @click="emails.push('')"
      >
        + Tambah penerima</button
      ><BaseButton :loading="busy" @click="save">Simpan penerima</BaseButton>
    </div>
    <p v-if="dirty" class="mt-3 text-xs text-muted">Perubahan penerima belum tersimpan.</p>
  </section>
</template>

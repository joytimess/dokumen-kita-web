<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import { t } from '../../services/workspace-language'

const props = defineProps<{
  kind: 'revision' | 'rejection'
  open: boolean
  busy: boolean
  disabled: boolean
  modelValue: string
  error?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; close: []; submit: [] }>()
const dialog = ref<HTMLDialogElement>()
watch(() => props.open, async (open) => {
  await nextTick()
  if (open && !dialog.value?.open) dialog.value?.showModal()
  else if (!open && dialog.value?.open) dialog.value.close()
}, { immediate: true })
</script>

<template>
  <dialog ref="dialog" :aria-labelledby="`signing-${kind}-title`" :aria-describedby="`signing-${kind}-description`" class="signing-decision-dialog fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-5 text-ink shadow-2xl sm:p-6" @cancel.prevent="!busy && emit('close')" @close="emit('close')">
    <h2 :id="`signing-${kind}-title`" class="text-lg font-semibold">{{ t(kind === 'revision' ? 'Minta revisi' : 'Tolak dokumen') }}</h2>
    <p :id="`signing-${kind}-description`" class="mt-2 text-sm text-muted">
      {{ t(kind === 'revision' ? 'Versi ini akan dihentikan dan semua tanda tangan perlu diulang pada draft baru.' : 'Penolakan menghentikan versi aktif. Owner menerima alasannya, dan signer berikutnya tidak mendapat giliran.') }}
    </p>
    <label :for="`signing-${kind}-reason`" class="mt-5 block text-sm font-semibold">{{ t('Alasan') }}</label>
    <textarea :id="`signing-${kind}-reason`" :value="modelValue" minlength="3" maxlength="1000" autofocus :disabled="busy" class="mt-2 min-h-28 w-full rounded border border-line p-3 text-sm" :placeholder="t(kind === 'revision' ? 'Alasan revisi (3–1000 karakter)' : 'Alasan penolakan (3–1000 karakter)')" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" />
    <FeedbackMessage :message="t(error || '')" error />
    <div class="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <button type="button" class="min-h-12 rounded-[7px] border border-line px-6 py-3 text-sm font-semibold" :disabled="busy" @click="emit('close')">{{ t('Batal') }}</button>
      <BaseButton :loading="busy" :disabled="disabled || modelValue.trim().length < 3 || modelValue.trim().length > 1000" @click="emit('submit')">{{ t(kind === 'revision' ? 'Minta revisi' : 'Tolak versi ini') }}</BaseButton>
    </div>
  </dialog>
</template>

<style scoped>
.signing-decision-dialog::backdrop {
  background: rgb(23 61 53 / 45%);
}
</style>

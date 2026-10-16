<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { confirmation, finishConfirmation, notice, notify } from '../../services/feedback'
import { t } from '../../services/workspace-language'

const dialog = ref<HTMLDialogElement>()
let accepted = false

watch(confirmation, async (request) => {
  if (!request) return
  accepted = false
  await nextTick()
  dialog.value?.showModal()
})

function close(value: boolean) {
  accepted = value
  dialog.value?.close()
}

function onClose() {
  setTimeout(() => finishConfirmation(accepted), 180)
}
</script>

<template>
  <Transition name="notice">
    <div
      v-if="notice"
      :key="notice.id"
      class="fixed top-5 right-5 z-100 flex w-[min(24rem,calc(100vw-2.5rem))] items-start gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg"
      :class="
        notice.kind === 'error'
          ? 'border-error text-error'
          : notice.kind === 'success'
            ? 'border-primary bg-sage text-primary'
            : 'border-line text-ink'
      "
      :role="notice.kind === 'error' ? 'alert' : 'status'"
    >
      <span class="min-w-0 flex-1 wrap-anywhere">{{ t(notice.message) }}</span>
      <button
        type="button"
        class="text-muted"
        :aria-label="t('Tutup notifikasi')"
        @click="notify.dismiss()"
      >×</button>
    </div>
  </Transition>

  <dialog
    ref="dialog"
    aria-labelledby="confirmation-title"
    aria-describedby="confirmation-message"
    class="confirmation-dialog fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-white p-6 text-ink shadow-2xl"
    @close="onClose"
  >
    <h2 id="confirmation-title" class="text-xl font-semibold">{{ t(confirmation?.title ?? '') }}</h2>
    <p id="confirmation-message" class="mt-3 text-sm leading-6 text-muted">
      {{ t(confirmation?.message ?? '') }}
    </p>
    <div class="mt-6 flex flex-wrap justify-end gap-3">
      <button
        type="button"
        class="min-h-11 rounded-lg border border-line px-5 text-sm font-semibold"
        @click="close(false)"
      >{{ t('Batal') }}</button>
      <button
        type="button"
        class="min-h-11 rounded-lg px-5 text-sm font-semibold text-white"
        :class="confirmation?.danger ? 'bg-error' : 'bg-primary'"
        @click="close(true)"
      >{{ t(confirmation?.action ?? '') }}</button>
    </div>
  </dialog>
</template>

<style scoped>
.confirmation-dialog {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
  transition: opacity 180ms ease-in, transform 180ms ease-in, display 180ms allow-discrete, overlay 180ms allow-discrete;
}
.confirmation-dialog[open] {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition-timing-function: ease-out;
}
@starting-style {
  .confirmation-dialog[open] { opacity: 0; transform: translateY(8px) scale(0.98); }
}
.confirmation-dialog::backdrop {
  background: rgb(23 61 53 / 0%);
  transition: background-color 180ms ease-in, display 180ms allow-discrete, overlay 180ms allow-discrete;
}
.confirmation-dialog[open]::backdrop {
  background: rgb(23 61 53 / 45%);
  transition-timing-function: ease-out;
}
@starting-style {
  .confirmation-dialog[open]::backdrop { background: rgb(23 61 53 / 0%); }
}
.notice-enter-active { transition: opacity 180ms ease-out, transform 180ms ease-out; }
.notice-leave-active { transition: opacity 180ms ease-in, transform 180ms ease-in; }
.notice-enter-from, .notice-leave-to { opacity: 0; transform: translateY(-8px); }
@media (prefers-reduced-motion: reduce) {
  .confirmation-dialog, .confirmation-dialog::backdrop, .notice-enter-active, .notice-leave-active { transition: none; }
}
</style>

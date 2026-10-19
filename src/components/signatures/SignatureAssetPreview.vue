<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { SignatureAsset } from '../../types/documents'
import { formatNumber, t } from '../../services/workspace-language'
import AssetImage from './AssetImage.vue'

defineProps<{ asset: SignatureAsset }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()

function closeFromBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) emit('close')
}

onMounted(() => dialog.value?.showModal())
onUnmounted(() => {
  if (dialog.value?.open) dialog.value.close()
})
</script>

<template>
  <dialog
    ref="dialog"
    aria-labelledby="signature-preview-title"
    class="signature-preview-dialog fixed inset-0 m-auto max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-4 text-ink shadow-2xl sm:p-5"
    @cancel.prevent="emit('close')"
    @click="closeFromBackdrop"
  >
    <header class="mb-3 flex items-center justify-between gap-3">
      <h2 id="signature-preview-title" class="text-base font-semibold">
        {{ t('Pratinjau Tanda Tangan') }}
      </h2>
      <button
        type="button"
        class="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        :aria-label="t('Tutup')"
        autofocus
        @click="emit('close')"
      >
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>
    </header>
    <div
      class="flex h-44 items-center justify-center overflow-hidden rounded-lg bg-soft px-3 sm:h-56"
    >
      <AssetImage :guid="asset.guid" image-class="h-full max-h-full w-full object-contain" />
    </div>
    <p class="mt-3 text-xs text-muted">
      {{ t(asset.source_type === 'drawn' ? 'Coretan' : 'Unggahan') }} ·
      {{ formatNumber(asset.width) }}×{{ formatNumber(asset.height) }} px
    </p>
  </dialog>
</template>

<style scoped>
.signature-preview-dialog::backdrop {
  background: rgb(23 61 53 / 45%);
}
</style>

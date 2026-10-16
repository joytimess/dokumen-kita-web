<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  loading: boolean
  conversionStatus?: string | null
  guid: string
}>()

const message = computed(() => {
  if (props.loading) return 'Memuat dokumen…'
  return ['queued', 'processing'].includes(props.conversionStatus ?? '')
    ? 'Mengolah PDF/DOCX…'
    : 'Membuat pratinjau…'
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-4"
    role="status"
    aria-live="polite"
  >
    <div class="w-full max-w-sm rounded-xl bg-white p-8 text-center shadow-lg">
      <span
        class="mx-auto mb-5 block size-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary motion-reduce:animate-none"
        aria-hidden="true"
      />
      <p class="font-semibold text-ink">{{ message }}</p>
      <p class="mt-2 text-sm text-muted">Hasil akan tampil otomatis setelah siap.</p>
      <RouterLink
        :to="`/documents/${guid}`"
        class="mt-5 inline-block text-sm text-primary underline"
        >Kembali ke detail dokumen</RouterLink
      >
    </div>
  </div>
</template>

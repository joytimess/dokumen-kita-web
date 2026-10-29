<script setup lang="ts">
import { useRouter } from 'vue-router'
import BaseButton from '../ui/BaseButton.vue'
import { t } from '../../services/workspace-language'

defineProps<{ title: string }>()
const router = useRouter()
</script>

<template>
  <section class="signing-success mx-auto flex w-full max-w-xl flex-col items-center rounded-xl border border-line bg-white px-5 py-10 text-center sm:px-10 sm:py-14" aria-live="polite">
    <svg class="size-16 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path class="signing-success-check" d="m8 12 2.6 2.6L16 9" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <h2 class="mt-5 text-2xl font-semibold text-ink">{{ t('Tanda Tangan Berhasil!') }}</h2>
    <p class="mt-2 text-sm text-muted">{{ t('Tanda tangan Anda berhasil disimpan.') }}</p>
    <div class="mt-7 w-full rounded-lg border border-line px-4 py-4 text-left">
      <p class="text-xs text-muted">{{ t('Nama dokumen') }}</p>
      <p class="mt-1 break-words font-semibold text-ink">{{ title }}</p>
    </div>
    <BaseButton class="mt-7 w-full sm:w-auto" @click="router.push('/dashboard')">
      {{ t('Kembali ke Dashboard') }}
    </BaseButton>
  </section>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .signing-success { animation: success-enter 500ms ease-in-out both; }
  .signing-success-check { stroke-dasharray: 12; stroke-dashoffset: 12; animation: check-draw 450ms ease-in-out 250ms forwards; }
  @keyframes success-enter {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes check-draw {
    to { stroke-dashoffset: 0; }
  }
}
</style>

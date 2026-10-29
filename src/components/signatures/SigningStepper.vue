<script setup lang="ts">
import { computed } from 'vue'
import { t } from '../../services/workspace-language'

const props = defineProps<{ step: 'reading' | 'signing' | 'success' }>()
const current = computed(() => ({ reading: 0, signing: 1, success: 2 })[props.step])
const steps = ['Membaca', 'Signing', 'Berhasil', 'Dashboard']
</script>

<template>
  <ol :aria-label="t('Tahap penandatanganan')" class="grid grid-cols-4 gap-2 rounded-xl border border-line bg-white p-4 sm:gap-4 sm:p-5">
    <li v-for="(label, index) in steps" :key="label" class="flex min-w-0 flex-col items-center gap-2 text-center sm:flex-row sm:text-left" :aria-current="index === current ? 'step' : undefined">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold" :class="index <= current ? 'border-primary bg-primary text-white' : 'border-line text-muted'" aria-hidden="true">
        <span v-if="index < current">&#10003;</span><span v-else>{{ index + 1 }}</span>
      </span>
      <span class="break-words text-xs sm:text-sm" :class="index === current ? 'font-semibold text-ink' : 'text-muted'">{{ t(label) }}</span>
      <span class="sr-only">{{ t(index < current ? 'Selesai' : index === current ? 'Tahap saat ini' : 'Belum dimulai') }}</span>
    </li>
  </ol>
</template>

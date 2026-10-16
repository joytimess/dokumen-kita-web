<script setup lang="ts">
import { t } from '../../services/workspace-language'
withDefaults(defineProps<{ to?: string; compact?: boolean }>(), { to: '/', compact: false })
</script>

<template>
  <RouterLink
    :to="to"
    class="inline-flex items-center whitespace-nowrap text-[23px] font-bold tracking-[-1.1px] text-ink hover:no-underline"
    :aria-label="t('Dokumen Kita — beranda')"
  >
    <span class="mr-2.5 grid h-[29px] w-[26px] place-items-center rounded-[5px] border-[1.5px] border-primary text-[22px] leading-none text-primary" aria-hidden="true">✓</span>
    <template v-if="!compact">dokumenkita<span class="text-primary">.</span></template>
  </RouterLink>
</template>

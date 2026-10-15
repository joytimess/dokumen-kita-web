<script setup lang="ts">
import { statusLabel } from '../../utils/documents'
defineProps<{ status: string }>()
</script>
<template>
  <span class="inline-block rounded-full bg-sage px-3 py-1 text-xs font-medium text-primary">{{
    statusLabel(status)
  }}</span>
</template>

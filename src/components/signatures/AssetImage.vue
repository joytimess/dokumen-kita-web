<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { documentsApi } from '../../services/documents.service'
import { t } from '../../services/workspace-language'
const props = defineProps<{ guid: string }>()
const url = ref(''),
  failed = ref(false)
let controller: AbortController | undefined
watch(
  () => props.guid,
  async (guid) => {
    controller?.abort()
    if (url.value) URL.revokeObjectURL(url.value)
    url.value = ''
    failed.value = false
    const request = new AbortController()
    controller = request
    try {
      const image = await documentsApi.assetImage(guid, request.signal)
      if (!request.signal.aborted) url.value = URL.createObjectURL(image)
    } catch {
      if (!request.signal.aborted) failed.value = true
    }
  },
  { immediate: true },
)
onUnmounted(() => {
  controller?.abort()
  if (url.value) URL.revokeObjectURL(url.value)
})
</script>
<template>
  <img
    v-if="url"
    :src="url"
    :alt="t('Tanda tangan milik Anda')"
    class="h-24 w-full object-contain"
  /><span v-else class="flex min-h-24 items-center justify-center text-xs text-muted">{{
    failed ? t('Gambar belum dapat dimuat') : t('Memuat gambar…')
  }}</span>
</template>

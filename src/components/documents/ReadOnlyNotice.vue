<script setup lang="ts">
import StatusBadge from './StatusBadge.vue'
import type { DocumentVersion } from '../../types/documents'
import { t } from '../../services/workspace-language'

defineProps<{
  status: DocumentVersion['status']
  notCurrent: boolean
  guid: string
  localContent?: string
  serverContent?: string
}>()

const emit = defineEmits<{ reload: [] }>()
</script>

<template>
  <div class="rounded-xl border border-line bg-white p-6">
    <StatusBadge :status="status" />
    <p class="mt-4 text-sm">
      {{ t('Dokumen tidak dapat diedit pada status atau hak akses saat ini. Perubahan lokal tidak dikirim lagi.') }}
    </p>
    <button class="mt-3 min-h-11 text-primary underline" @click="emit('reload')">
      {{ t('Muat ulang versi server') }}
    </button>

    <template v-if="localContent !== undefined">
      <p class="mt-4 text-xs text-muted">
        {{ t('Salin perubahan lokal di bawah sebelum memuat ulang. Tidak ada pengiriman ulang otomatis.') }}
      </p>
      <textarea
        readonly
        :value="localContent"
        :aria-label="t('Salinan perubahan editor lokal')"
        class="mt-2 h-48 w-full rounded border border-line p-3 font-mono text-xs"
      />
    </template>

    <details v-if="serverContent" class="mt-4 text-sm">
      <summary class="cursor-pointer text-primary">{{ t('Bandingkan isi versi server') }}</summary>
      <textarea
        readonly
        :value="serverContent"
        :aria-label="t('Isi editor versi server')"
        class="mt-2 h-48 w-full rounded border border-line p-3 font-mono text-xs"
      />
    </details>

    <RouterLink
      v-if="notCurrent"
      :to="`/documents/${guid}`"
      class="mt-3 block text-sm text-primary underline"
      >{{ t('Buka draft terkini') }}</RouterLink
    >
  </div>
</template>

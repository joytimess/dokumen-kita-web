<script setup lang="ts">
import type { DecorationDraft, DecorationKind } from '../../utils/decorations'
import { t } from '../../services/workspace-language'
import SelectControl from '../ui/SelectControl.vue'

defineProps<{
  kind: DecorationKind
  title: string
  draft: DecorationDraft
  hasSaved: boolean
  editable: boolean
  busy: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  choose: [event: Event]
  remove: []
  edit: []
}>()
</script>

<template>
  <section class="rounded-xl border border-line bg-white p-5" :aria-label="t(title)">
    <h2 class="font-semibold">{{ t(title) }}</h2>
    <div
      v-if="draft.imageUrl"
      class="relative mt-4 flex min-h-28 items-center justify-center rounded border border-line bg-soft p-2"
    >
      <img
        :src="draft.imageUrl"
        :alt="t('Pratinjau :title', { title: title.toLowerCase() })"
        class="max-h-40 max-w-[calc(100%-3rem)] object-contain"
      />
      <button
        type="button"
        class="absolute top-0 right-0 grid size-11 place-items-center disabled:opacity-50"
        :aria-label="t(kind === 'letterhead' ? 'Hapus kop surat' : 'Hapus footer')"
        :disabled="!editable || busy || saving"
        @click="emit('remove')"
      >
        <span class="grid size-5 place-items-center rounded-full bg-red-500 text-xs text-white" aria-hidden="true">×</span>
      </button>
    </div>
    <input
      v-else
      type="file"
      accept="image/png,image/jpeg,image/webp"
      class="mt-4 block w-full min-w-0 cursor-pointer rounded-xl border border-line bg-white p-1 text-sm text-muted transition-colors hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-lg file:border-0 file:bg-sage file:px-4 file:py-2.5 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/10 motion-reduce:transition-none"
      :aria-label="t('Unggah gambar :title', { title: title.toLowerCase() })"
      :disabled="!editable || busy || saving"
      @change="emit('choose', $event)"
    />
    <p class="mt-2 text-xs text-muted">
      {{ t('Unggah gambar yang sudah dipotong. PNG, JPEG, atau WebP; maksimal 1200 × 400 piksel dan 2 MB.') }}
    </p>

    <div v-if="(hasSaved || draft.file) && !draft.remove" class="mt-4 grid gap-3 text-sm">
      <div>
        {{ t('Cakupan halaman') }}
        <SelectControl
          v-model="draft.mode"
          :aria-label="t('Cakupan halaman')"
          class="ml-2 min-h-11"
          :options="[
            { value: 'all', label: t('Semua halaman') },
            { value: 'range', label: t('Halaman tertentu') },
          ]"
          :disabled="saving"
          @change="emit('edit')"
        />
      </div>
      <label v-if="draft.mode === 'range'" class="grid gap-1"
        >{{ t('Nomor/rentang halaman') }}
        <input
          v-model="draft.ranges"
          class="min-h-11 rounded border border-line px-3"
          placeholder="1, 3-5"
          :disabled="saving"
          @input="emit('edit')"
        />
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { DecorationDraft, DecorationKind } from '../../utils/decorations'

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
  <section class="rounded-xl border border-line bg-white p-5" :aria-label="title">
    <h2 class="font-semibold">{{ title }}</h2>
    <div
      v-if="draft.imageUrl"
      class="relative mt-4 flex min-h-28 items-center justify-center rounded border border-line bg-soft p-2"
    >
      <img
        :src="draft.imageUrl"
        :alt="`Pratinjau ${title.toLowerCase()}`"
        class="max-h-40 max-w-[calc(100%-3rem)] object-contain"
      />
      <button
        type="button"
        class="absolute top-0 right-0 grid size-11 place-items-center disabled:opacity-50"
        :aria-label="kind === 'letterhead' ? 'Hapus kop surat' : 'Hapus footer'"
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
      class="mt-4 block max-w-full text-sm"
      :aria-label="`Unggah gambar ${title.toLowerCase()}`"
      :disabled="!editable || busy || saving"
      @change="emit('choose', $event)"
    />
    <p class="mt-2 text-xs text-muted">
      Unggah gambar yang sudah dipotong. PNG, JPEG, atau WebP; maksimal 1200 × 400 piksel dan 2 MB.
    </p>

    <div v-if="(hasSaved || draft.file) && !draft.remove" class="mt-4 grid gap-3 text-sm">
      <label
        >Cakupan halaman
        <select
          v-model="draft.mode"
          class="ml-2 min-h-11 rounded border border-line px-3"
          :disabled="saving"
          @change="emit('edit')"
        >
          <option value="all">Semua halaman</option>
          <option value="range">Halaman tertentu</option>
        </select>
      </label>
      <label v-if="draft.mode === 'range'" class="grid gap-1"
        >Nomor/rentang halaman
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

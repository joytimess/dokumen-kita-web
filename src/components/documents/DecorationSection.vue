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
    <p class="mt-2 text-xs text-muted">
      Unggah gambar yang sudah dipotong. PNG, JPEG, atau WebP; maksimal 1200 × 400 piksel dan 2 MB.
    </p>

    <img
      v-if="draft.imageUrl"
      :src="draft.imageUrl"
      :alt="`Pratinjau ${title.toLowerCase()}`"
      class="mt-4 max-h-40 max-w-full object-contain"
    />

    <div class="mt-4 flex flex-wrap items-center gap-3">
      <label
        class="inline-flex min-h-11 cursor-pointer items-center rounded border border-line px-4 text-sm text-primary"
      >
        {{ hasSaved || draft.file ? 'Ganti gambar' : 'Unggah gambar' }}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          class="sr-only"
          :disabled="!editable || busy || saving"
          @change="emit('choose', $event)"
        />
      </label>
      <button
        v-if="hasSaved || draft.file"
        type="button"
        class="min-h-11 text-sm text-error underline"
        :disabled="!editable || busy || saving"
        @click="emit('remove')"
      >
        {{ kind === 'letterhead' ? 'Hapus kop' : 'Hapus footer' }}
      </button>
    </div>

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

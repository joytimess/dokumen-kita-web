<script setup lang="ts">
import type { DecorationDraft, DecorationKind } from '../../utils/decorations'
import { t } from '../../services/workspace-language'

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
  edit: [changes: Partial<Pick<DecorationDraft, 'mode' | 'ranges'>>]
}>()

function changeMode(value: string | number) {
  emit('edit', { mode: value === 'range' ? 'range' : 'all' })
}

function changeRanges(event: Event) {
  emit('edit', { ranges: (event.target as HTMLInputElement).value })
}
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
      {{ t('Disarankan 1200 × 400 piksel (3:1) agar memenuhi lebar area dokumen. Proporsi gambar tetap dipertahankan di PDF.') }}
    </p>

    <fieldset
      v-if="(hasSaved || draft.file) && !draft.remove"
      class="mt-4 min-w-0 rounded-xl border border-line bg-soft/30 p-4 text-sm"
      :aria-label="t('Cakupan halaman')"
      :disabled="!editable || busy || saving"
    >
      <h3 class="font-semibold">{{ t('Cakupan halaman') }}</h3>
      <p class="mt-1 text-xs text-muted">{{ t('Tentukan halaman yang akan diproses.') }}</p>
      <div class="mt-3 grid grid-cols-2 gap-1" role="group" :aria-label="t('Cakupan halaman')">
        <button
          v-for="mode in (['all', 'range'] as const)"
          :key="mode"
          type="button"
          class="min-h-11 rounded-full px-3 py-2 text-xs font-semibold transition-colors hover:bg-sage/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
          :class="draft.mode === mode ? 'bg-sage text-primary' : 'text-muted'"
          :aria-pressed="draft.mode === mode"
          @click="changeMode(mode)"
        >
          {{ t(mode === 'all' ? 'Semua halaman' : 'Halaman tertentu') }}
        </button>
      </div>
      <div v-if="draft.mode === 'all'" class="mt-5 flex items-start gap-3 px-2 pb-2">
        <span class="material-symbols-outlined mt-0.5 text-lg text-muted" aria-hidden="true">content_copy</span>
        <div>
          <p class="font-semibold">{{ t('Seluruh halaman dokumen') }}</p>
          <p class="mt-1 text-xs text-muted">{{ t('Tidak perlu menentukan nomor halaman.') }}</p>
        </div>
      </div>
      <label v-else class="mt-4 grid gap-1.5 text-muted"
        >{{ t('Nomor halaman') }}
        <input
          type="number"
          min="1"
          step="1"
          :value="draft.ranges"
          class="min-h-12 w-full rounded-lg border border-line bg-white px-3 text-ink placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="1"
          @input="changeRanges"
        />
        <span class="text-xs">{{ t('Masukkan nomor halaman.') }}</span>
      </label>
    </fieldset>
  </section>
</template>

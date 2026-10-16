<script setup lang="ts">
import type { DocumentVersion } from '../../types/documents'
import { conversionFailure } from '../../utils/documents'

defineProps<{
  version: DocumentVersion
  editable: boolean
  busy: boolean
  importUncertain: boolean
  sourceUrl: string
  sourceBusy: boolean
}>()

const emit = defineEmits<{
  upload: [event: Event]
  retry: []
  open: []
  close: []
}>()

function warningText(warning: string) {
  if (warning.includes('SKIPPED') || warning.includes('EXCEEDED'))
    return 'Sebagian gambar dilewati karena batas editor.'
  if (warning.includes('TABLE') || warning.includes('GRAPHICS'))
    return 'Tabel dan grafik perlu diperiksa.'
  if (warning.includes('IMAGE')) return 'Posisi gambar perlu diperiksa.'
  return 'Tata letak mungkin berubah; periksa hasil edit.'
}
</script>

<template>
  <div class="rounded-xl border border-line bg-white p-5">
    <h2 class="font-semibold">Sumber PDF / DOCX</h2>
    <p class="my-3 text-sm text-muted">
      Berkas sumber disimpan privat. Hasil konversi dapat mengubah tata letak; periksa tabel,
      grafik, dan gambar sebelum mengirim.
    </p>

    <p
      v-if="['queued', 'processing'].includes(version.conversion_status ?? '')"
      role="status"
      class="mb-3 text-sm"
    >
      Dokumen sedang dikonversi ({{ version.conversion_status }}).
    </p>
    <p v-if="version.conversion_status === 'failed'" class="mb-3 text-sm text-error">
      {{ conversionFailure(version.conversion_error_code) }}
    </p>
    <p v-if="version.conversion_status === 'ready'" class="mb-3 text-sm">
      Konversi siap · {{ version.conversion_page_count ?? '—' }} halaman. Periksa hasil editor.
    </p>
    <p
      v-for="warning in version.conversion_warnings"
      :key="warning"
      class="mb-2 text-xs text-muted"
    >
      {{ warningText(warning) }}
    </p>
    <p v-if="version.has_source" class="mb-3 text-xs">
      Sumber tersimpan: {{ version.source_type }}
    </p>

    <label
      class="inline-flex min-h-11 cursor-pointer items-center rounded border border-line px-4 text-sm text-primary"
      >{{ version.has_source ? 'Ganti sumber' : 'Unggah sumber'
      }}<input
        type="file"
        accept=".pdf,.docx"
        class="sr-only"
        :disabled="busy || !editable || importUncertain"
        @change="emit('upload', $event)"
    /></label>
    <p class="mt-3 text-xs text-muted">Maksimal 20.480 KB sesuai konfigurasi backend saat ini.</p>
    <p v-if="importUncertain" class="mt-3 text-xs text-error">
      Hasil upload belum pasti. Detail sudah diperiksa ulang; tinjau metadata dan muat ulang sebelum
      mengunggah lagi.
    </p>

    <button
      v-if="version.conversion_status === 'failed'"
      class="ml-3 min-h-11 text-sm text-primary underline"
      :disabled="busy"
      @click="emit('retry')"
    >
      Coba konversi lagi
    </button>
    <button
      v-if="version.has_source"
      class="ml-3 min-h-11 text-sm text-primary underline"
      :disabled="sourceBusy"
      @click="emit('open')"
    >
      {{ version.source_type === 'docx' ? 'Unduh sumber DOCX' : 'Lihat PDF asli' }}
    </button>

    <div v-if="sourceUrl" class="mt-4">
      <button class="mb-2 text-xs text-primary underline" @click="emit('close')">
        Tutup sumber asli
      </button>
      <iframe
        :src="sourceUrl"
        title="PDF sumber asli"
        class="h-[65vh] w-full rounded border border-line"
      />
    </div>
  </div>
</template>

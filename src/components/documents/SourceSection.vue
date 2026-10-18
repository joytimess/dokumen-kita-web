<script setup lang="ts">
import type { DocumentVersion } from '../../types/documents'
import { conversionFailure } from '../../utils/documents'
import { formatNumber, t } from '../../services/workspace-language'

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
  if (warning === 'PDF_OCR_SKIPPED_LIMIT')
    return t('Diimpor dari teks digital saja karena PDF melewati batas OCR 1 MB atau 3 halaman. Teks scan belum dikonversi.')
  if (warning === 'PDF_OCR_SKIPPED_QUOTA')
    return t('Diimpor dari teks digital saja karena kuota OCR tidak tersedia. Teks scan belum dikonversi.')
  if (warning.includes('OCR_PARTIAL')) return t('OCR belum dapat membaca sebagian halaman; periksa hasilnya.')
  if (warning.includes('OCR')) return t('Teks hasil OCR perlu diperiksa dan dikoreksi sebelum digunakan.')
  if (warning.includes('SKIPPED') || warning.includes('EXCEEDED'))
    return t('Sebagian gambar dilewati karena batas editor.')
  if (warning.includes('TABLE') || warning.includes('GRAPHICS'))
    return t('Tabel dan grafik perlu diperiksa.')
  if (warning.includes('IMAGE')) return t('Posisi gambar perlu diperiksa.')
  return t('Tata letak mungkin berubah; periksa hasil edit.')
}

function isPartialImport(warnings?: string[] | null) {
  return warnings?.some((warning) => ['PDF_OCR_SKIPPED_LIMIT', 'PDF_OCR_SKIPPED_QUOTA'].includes(warning)) ?? false
}
</script>

<template>
  <div class="rounded-xl border border-line bg-white p-5">
    <h2 class="font-semibold">{{ t('Sumber PDF / DOCX') }}</h2>
    <p class="my-3 text-sm text-muted">
      {{ t('Berkas sumber disimpan privat. Hasil konversi dapat mengubah tata letak; periksa tabel, grafik, dan gambar sebelum mengirim.') }}
    </p>

    <p
      v-if="['queued', 'processing'].includes(version.conversion_status ?? '')"
      role="status"
      class="mb-3 text-sm"
    >
      {{ t('Dokumen sedang dikonversi (:status).', { status: t(version.conversion_status ?? '') }) }}
    </p>
    <p v-if="version.conversion_status === 'failed'" class="mb-3 text-sm text-error">
      {{ t(conversionFailure(version.conversion_error_code)) }}
    </p>
    <p v-if="version.conversion_status === 'ready'" class="mb-3 text-sm">
      {{ t(isPartialImport(version.conversion_warnings) ? 'Hasil impor sebagian · :count halaman. Periksa teks digital yang tersedia.' : 'Konversi siap · :count halaman. Periksa hasil editor.', { count: formatNumber(version.conversion_page_count ?? 0) }) }}
    </p>
    <p
      v-for="warning in version.conversion_warnings"
      :key="warning"
      class="mb-2 text-xs text-muted"
    >
      {{ warningText(warning) }}
    </p>
    <p v-if="version.has_source" class="mb-3 text-xs">
      {{ t('Sumber tersimpan: :type', { type: t(version.source_type ?? '') }) }}
    </p>

    <label
      class="inline-flex min-h-11 cursor-pointer items-center rounded border border-line px-4 text-sm text-primary"
      >{{ t(version.has_source ? 'Ganti sumber' : 'Unggah sumber')
      }}<input
        type="file"
        accept=".pdf,.docx"
        class="sr-only"
        :disabled="busy || !editable || importUncertain"
        @change="emit('upload', $event)"
    /></label>
    <p class="mt-3 text-xs text-muted">{{ t('Maksimal 20.480 KB sesuai konfigurasi backend saat ini.') }}</p>
    <p class="mt-2 text-xs text-muted">
      {{ t('Impor mengikuti batas upload. OCR PDF scan gratis maksimal 1 MB dan 3 halaman; jika batas tercapai, hanya teks digital yang dapat diimpor.') }}
    </p>
    <p v-if="importUncertain" class="mt-3 text-xs text-error">
      {{ t('Hasil upload belum pasti. Detail sudah diperiksa ulang; tinjau metadata dan muat ulang sebelum mengunggah lagi.') }}
    </p>

    <button
      v-if="version.conversion_status === 'failed'"
      class="ml-3 min-h-11 text-sm text-primary underline"
      :disabled="busy"
      @click="emit('retry')"
    >
      {{ t('Coba konversi lagi') }}
    </button>
    <button
      v-if="version.has_source"
      class="ml-3 min-h-11 text-sm text-primary underline"
      :disabled="sourceBusy"
      @click="emit('open')"
    >
      {{ t(version.source_type === 'docx' ? 'Unduh sumber DOCX' : 'Lihat PDF asli') }}
    </button>

    <div v-if="sourceUrl" class="mt-4">
      <button class="mb-2 text-xs text-primary underline" @click="emit('close')">
        {{ t('Tutup sumber asli') }}
      </button>
      <iframe
        :src="sourceUrl"
        :title="t('PDF sumber asli')"
        class="h-[65vh] w-full rounded border border-line"
      />
    </div>
  </div>
</template>

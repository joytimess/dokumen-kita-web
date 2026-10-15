import axios from 'axios'
import { retryDeadline } from '../utils/recovery'
export function workspaceError(error: unknown) {
  const response = axios.isAxiosError(error) ? error.response : undefined
  const status = response?.status
  const code = response?.data?.error?.code as string | undefined
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(response?.data?.error?.errors ?? {})) {
    if (Array.isArray(value) && typeof value[0] === 'string') fields[key] = value[0]
  }
  let message =
    'Hasil permintaan belum dapat dipastikan. Periksa status sebelum mengulang tindakan.'
  const known: Record<string, string> = {
    EDITOR_REVISION_CONFLICT: 'Isi draft berubah di sesi lain. Perubahan lokal dipertahankan untuk ditinjau.',
    REPLACE_EDITOR_DATA_REQUIRED: 'Konfirmasi penggantian isi editor sebelum mengimpor ulang.',
    DRAFT_CHANGED: 'Draft berubah selama proses. Periksa isi terbaru sebelum mencoba lagi.',
    CONVERSION_NOT_READY: 'Konversi dokumen belum selesai.',
    PDF_TEXT_LAYER_MISSING: 'PDF scan membutuhkan OCR yang belum tersedia.',
    PDF_CONVERSION_FAILED: 'PDF belum dapat dikonversi. Periksa berkas dan coba lagi.',
    DOCUMENT_PAGE_LIMIT: 'Jumlah halaman berkas melebihi batas server.',
    EDITOR_PREVIEW_REQUIRED: 'Buat pratinjau terbaru dari isi editor sebelum melanjutkan.',
    VERSION_CONFLICT: 'Versi dokumen berubah. Periksa status terbaru.',
    VERSION_NOT_EDITABLE: 'Versi ini tidak dapat diedit lagi.',
    PDF_NOT_READY: 'PDF belum siap. Periksa status kembali.',
  }
  if (status === 401) message = 'Sesi berakhir. Masuk kembali untuk melanjutkan.'
  else if (status === 403)
    message =
      code === 'EMAIL_NOT_VERIFIED'
        ? 'Verifikasi email sebelum melanjutkan.'
        : 'Akses atau giliran tindakan ini belum tersedia untuk akun Anda.'
  else if (status === 404) message = 'Dokumen atau sumber daya tidak tersedia untuk akun Anda.'
  else if (status === 409)
    message =
      code === 'IDEMPOTENCY_CONFLICT'
        ? 'Tindakan sebelumnya memiliki data berbeda. Periksa status terbaru sebelum melanjutkan.'
        : 'Status versi, pratinjau, atau giliran telah berubah. Muat ulang status sebelum melanjutkan.'
  else if (status === 419)
    message = 'Sesi keamanan berakhir. Muat ulang halaman atau masuk kembali.'
  else if (status === 422)
    message =
      code === 'INVITATION_INVALID'
        ? 'Undangan tidak valid, kedaluwarsa, atau tidak sesuai dengan email akun.'
        : 'Periksa kembali data yang Anda masukkan.'
  else if (status === 413) message = 'Ukuran berkas melebihi batas server.'
  else if (status === 429) message = 'Terlalu banyak permintaan. Tunggu sebelum mencoba kembali.'
  if (code && known[code] && status !== 401 && status !== 403) message = known[code]
  return {
    message,
    fields,
    status,
    code,
    ambiguous: !status || status >= 500,
    retryAt: status === 429 ? retryDeadline(response?.headers?.['retry-after'], Date.now()) : 0,
  }
}

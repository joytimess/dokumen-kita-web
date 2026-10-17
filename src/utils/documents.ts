import type { Assignment, DocumentRecord, DocumentVersion, Placeholder } from '../types/documents'
import { language, t } from '../services/workspace-language'
const labels: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'Dalam proses tanda tangan',
  waiting: 'Menunggu giliran',
  ready: 'Giliran tanda tangan',
  signed: 'Sudah ditandatangani',
  finalizing: 'Menyiapkan dokumen final',
  completed: 'Selesai',
  none: 'Pratinjau belum tersedia',
  stale: 'Pratinjau perlu diperbarui',
  queued: 'Menunggu pratinjau',
  failed: 'Pratinjau gagal',
  preparing: 'Menyiapkan',
  revision_requested: 'Revisi diminta',
  superseded: 'Digantikan',
  rejected: 'Ditolak',
}
export const statusLabel = (status: string) => labels[status] ? t(labels[status]!) : status
export const dateLabel = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString(language.value === 'en' ? 'en-US' : 'id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—'
export function ownAssignment(document: DocumentRecord, user: { guid: string; email: string }) {
  const assignments = document.current_version.assignments ?? []
  // Non-owner resources contain only assignments bound to the current account.
  return document.owner_guid !== user.guid
    ? assignments[0]
    : assignments.find(
        (a) => a.claimed_at && a.recipient_email.toLowerCase() === user.email.toLowerCase(),
      )
}
export function validSigners(emails: string[]) {
  const normalized = emails.map((email) => email.trim().toLowerCase())
  return (
    normalized.length <= 50 &&
    new Set(normalized).size === normalized.length &&
    normalized.every((email) => email.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
}
export function validPlaceholder(p: Placeholder, pages: number) {
  return (
    Number.isInteger(p.page_number) &&
    p.page_number >= 1 &&
    p.page_number <= pages &&
    [p.x, p.y, p.width, p.height].every(Number.isFinite) &&
    p.x >= 0 &&
    p.y >= 0 &&
    p.width > 0 &&
    p.height > 0 &&
    Math.round((p.x + p.width) * 1e6) <= 1e6 &&
    Math.round((p.y + p.height) * 1e6) <= 1e6
  )
}
export const roundPosition = (n: number) => Math.round(n * 1e6) / 1e6
export const snapshotReady = (document: DocumentRecord) =>
  document.current_version.preview_status === 'ready' &&
  !!document.current_version.content_hash &&
  !!document.current_version.preview_page_count
export const areasReviewed = (assignments: Assignment[], pages: number) =>
  assignments.length > 0 &&
  assignments.every(
    (a) =>
      !!a.placeholders?.length &&
      a.placeholders.length <= 100 &&
      a.placeholders.every((p) => !p.needs_review && validPlaceholder(p, pages)),
  )
export function expectedConversion(old: DocumentVersion, fresh: DocumentVersion) {
  return !!old.conversion_generation &&
    old.conversion_generation === fresh.conversion_generation &&
    ['queued', 'processing'].includes(old.conversion_status ?? '') &&
    fresh.conversion_status === 'ready'
}
export function remoteVersionConflict(
  old: DocumentVersion,
  fresh: DocumentVersion,
  localDirty: boolean,
  saving: boolean,
  positionsDirty: boolean,
) {
  return fresh.status !== 'draft' || fresh.is_current === false ||
    (fresh.editor_revision !== old.editor_revision &&
      (!expectedConversion(old, fresh) || localDirty || saving)) ||
    (localDirty && old.conversion_generation !== fresh.conversion_generation) ||
    (positionsDirty && (fresh.content_hash !== old.content_hash || fresh.preview_status !== old.preview_status))
}
export function conversionFailure(code?: string | null) {
  switch (code) {
    case 'PDF_TEXT_LAYER_MISSING': return 'OCR belum dikonfigurasi untuk mengubah PDF scan menjadi teks editor.'
    case 'OCR_LIMIT_EXCEEDED': return 'PDF scan melewati batas ukuran atau halaman OCR.'
    case 'OCR_TEXT_UNRECOGNIZED': return 'Teks pada PDF scan tidak berhasil dikenali.'
    case 'OCR_PROVIDER_NOT_CONFIGURED': return 'OCR belum dikonfigurasi pada server.'
    case 'OCR_SERVICE_UNAVAILABLE': return 'Layanan OCR sedang tidak tersedia. Coba konversi lagi nanti.'
    case 'OCR_QUOTA_EXHAUSTED': return 'Kuota OCR habis. Coba lagi setelah kuota tersedia.'
    case 'DOCUMENT_PAGE_LIMIT': return 'Jumlah halaman berkas melebihi batas server.'
    case 'DRAFT_CHANGED': return 'Draft berubah selama konversi. Periksa isi editor sebelum mencoba lagi.'
    case 'PDF_CONVERSION_FAILED': return 'PDF belum dapat dikonversi. Periksa berkas dan coba lagi.'
    default: return 'Konversi gagal. Isi draft tetap tersimpan; periksa status sebelum mencoba lagi.'
  }
}

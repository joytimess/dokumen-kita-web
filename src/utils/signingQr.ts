import { ref } from 'vue'
const key = 'dokumen-kita.pending-signing-qr.v1'
export const signingQrToken = ref('')
export function rememberSigningQr(token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return false
  signingQrToken.value = token
  try { sessionStorage.setItem(key, token) } catch { /* Continue in this tab's memory. */ }
  return true
}
export function pendingSigningQr() {
  if (signingQrToken.value) return signingQrToken.value
  try {
    const value = sessionStorage.getItem(key)
    if (value && /^[a-f0-9]{64}$/.test(value)) signingQrToken.value = value
  } catch { /* Continue in this tab's memory. */ }
  return signingQrToken.value
}
export function clearSigningQr() {
  signingQrToken.value = ''
  try { sessionStorage.removeItem(key) } catch { /* Optional storage. */ }
}
export const qrStatusLabel = (status: string) => ({
  active: 'QR aktif. Hanya penandatangan yang ditentukan dapat melanjutkan.',
  invalid: 'QR tidak valid. Buka kembali tautan QR dari pemilik dokumen.',
  revoked: 'QR sudah dicabut. Dokumen tidak lagi menerima tanda tangan.',
  superseded: 'QR ini untuk versi dokumen lama. Minta QR versi terbaru kepada pemilik.',
  draft: 'QR belum tersedia untuk draft dokumen.',
  waiting: 'Menunggu giliran Sequential. Periksa kembali setelah penandatangan sebelumnya selesai.',
  already_signed: 'Anda sudah menandatangani versi dokumen ini.',
  finalizing: 'Dokumen sedang finalisasi. Tanda tangan tambahan tidak diterima.',
  completed: 'Dokumen telah selesai ditandatangani.',
  not_assigned: 'Email akun ini tidak memiliki assignment untuk versi dokumen ini.',
  email_not_verified: 'Verifikasi email akun Anda sebelum melanjutkan.',
} as Record<string, string>)[status] ?? 'Status QR belum dapat dipastikan. Coba periksa kembali.'

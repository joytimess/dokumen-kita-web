import axios from 'axios'
import type { FieldErrors } from '../types/auth'

export const recoveryKey = 'dokumen-kita.password-recovery.v1'
export const acceptedMessage = 'Jika akun Anda memiliki password, kode OTP akan dikirim ke email tersebut.'
export const expiredMessage = 'Kode sudah kedaluwarsa. Minta kode baru untuk melanjutkan.'
export const sessionEndedMessage = 'Sesi pemulihan telah berakhir. Minta kode baru untuk melanjutkan.'
export function normalizeEmail(email: string) { return email.trim().toLowerCase() }
export function validateRecovery(stage: string, email: string, otp: unknown, password: string, confirmation: string): FieldErrors {
  const errors: FieldErrors = {}
  if (stage === 'email') {
    if (!email.trim()) errors.email = 'Email wajib diisi.'
    else if (email.trim().length > 255) errors.email = 'Email maksimal 255 karakter.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Masukkan alamat email yang valid.'
  } else if (stage === 'otp') {
    if (typeof otp !== 'string' || !/^[0-9]{6}$/.test(otp.trim())) errors.otp = 'Masukkan kode OTP tepat 6 digit.'
  } else if (stage === 'password') {
    if (password.length < 8) errors.password = 'Password minimal 8 karakter.'
    if (!confirmation) errors.password_confirmation = 'Konfirmasi password wajib diisi.'
    else if (password !== confirmation) errors.password_confirmation = 'Konfirmasi password belum sama.'
  }
  return errors
}
export function secondsRemaining(deadline: number, now: number) { return Math.max(0, Math.ceil((deadline - now) / 1000)) }
export function retryDeadline(value: unknown, now: number): number {
  if (typeof value !== 'string' && typeof value !== 'number') return now + 60000
  const raw = String(value).trim()
  if (/^\d+(\.\d+)?$/.test(raw)) return now + Number(raw) * 1000
  const date = Date.parse(raw)
  return Number.isFinite(date) ? Math.max(now, date) : now + 60000
}
export function recoveryError(error: unknown, action: 'email' | 'otp' | 'password', now: number) {
  const result = { fields: {} as FieldErrors, message: 'Tidak dapat terhubung. Periksa koneksi Anda, lalu coba lagi.', blockedUntil: 0, invalidToken: false, uncertain: false }
  if (error instanceof Error && error.message === 'DEMO_OTP') {
    result.fields.otp = 'Kode OTP tidak valid atau sudah kedaluwarsa.'
    result.message = 'Periksa kode demo Anda.'
    return result
  }
  if (error instanceof Error && error.message === 'DEMO_TOKEN') { result.invalidToken = true; return result }
  const response = axios.isAxiosError(error) ? error.response : undefined
  const status = response?.status
  if (status === 422) {
    const fields = response?.data?.error?.errors
    result.message = 'Periksa kembali data yang Anda masukkan.'
    for (const key of ['email', 'otp', 'password', 'password_confirmation']) {
      if (Array.isArray(fields?.[key]) && typeof fields[key][0] === 'string') result.fields[key] = fields[key][0]
    }
    // Email acceptance stays generic; never surface account-existence information.
    if (action === 'email') result.fields = { email: 'Periksa format alamat email Anda, lalu coba lagi.' }
    if (action === 'password' && (fields?.reset_token || /TOKEN/.test(response?.data?.error?.code || ''))) result.invalidToken = true
  } else if (status === 429) {
    result.message = 'Terlalu banyak percobaan. Tunggu sebelum mencoba kembali; pembatasan server dapat berlangsung lebih lama.'
    result.blockedUntil = retryDeadline(response?.headers?.['retry-after'], now)
  } else if (status === 419) result.message = 'Sesi keamanan telah berakhir. Muat ulang halaman, lalu coba lagi.'
  else if (!status || status >= 500) {
    result.uncertain = true
    result.message = action === 'otp'
      ? 'Hasil verifikasi belum dapat dipastikan. Minta kode baru untuk melanjutkan.'
      : action === 'password'
        ? 'Hasil perubahan password belum dapat dipastikan. Anda dapat mencoba masuk dengan password baru atau memulai pemulihan lagi.'
        : 'Permintaan belum dapat dipastikan. Periksa koneksi Anda, lalu coba lagi.'
  }
  return result
}

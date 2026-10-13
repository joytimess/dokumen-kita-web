import axios from 'axios'
import type { AuthKind, FieldErrors } from '../types/auth'
export function authError(
  error: unknown,
  kind: AuthKind,
): { message: string; fields: FieldErrors; expired: boolean } {
  const result = {
    message: 'Tidak dapat terhubung. Periksa koneksi Anda, lalu coba lagi.',
    fields: {} as FieldErrors,
    expired: false,
  }
  if (!axios.isAxiosError(error)) return result
  const status = error.response?.status
  if (status === 422) {
    const fields = error.response?.data?.error?.errors
    if (kind === 'login')
      result.message = 'Email atau kata sandi salah. Periksa kembali dan coba lagi.'
    else if (kind === 'forgot') result.message = 'Periksa format alamat email Anda, lalu coba lagi.'
    else {
      result.message = 'Periksa kembali data pendaftaran Anda.'
      for (const key of ['name', 'email', 'password', 'password_confirmation'])
        if (Array.isArray(fields?.[key]) && typeof fields[key][0] === 'string')
          result.fields[key] = fields[key][0]
    }
  } else if (status === 401) {
    result.expired = true
    result.message = 'Sesi tidak tersedia atau telah berakhir. Silakan masuk kembali.'
  } else if (status === 403)
    result.message =
      error.response?.data?.error?.code === 'EMAIL_NOT_VERIFIED'
        ? 'Email Anda perlu diverifikasi untuk tindakan ini.'
        : 'Akses ditolak. Silakan coba kembali atau hubungi pengelola.'
  else if (status === 419)
    result.message = 'Sesi keamanan telah berakhir. Muat ulang halaman, lalu coba lagi.'
  else if (status === 429) result.message = 'Terlalu banyak percobaan. Silakan coba lagi nanti.'
  else if (status && status >= 500)
    result.message = 'Layanan sedang mengalami gangguan. Silakan coba lagi nanti.'
  return result
}

import type { AuthKind, FieldErrors } from '../types/auth'
export interface AuthFields {
  name: string
  email: string
  password: string
  password_confirmation: string
  remember: boolean
}
export function validateAuth(kind: AuthKind, fields: AuthFields): FieldErrors {
  const errors: FieldErrors = {}
  if (kind === 'register') {
    if (!fields.name.trim()) errors.name = 'Nama lengkap wajib diisi.'
    else if (fields.name.trim().length > 255) errors.name = 'Nama maksimal 255 karakter.'
  }
  const email = fields.email.trim()
  if (!email) errors.email = 'Email wajib diisi.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = 'Masukkan alamat email yang valid.'
  else if (email.length > 255) errors.email = 'Email maksimal 255 karakter.'
  if (kind !== 'forgot') {
    if (!fields.password) errors.password = 'Kata sandi wajib diisi.'
    else if (kind === 'register' && fields.password.length < 8)
      errors.password = 'Kata sandi minimal 8 karakter.'
  }
  if (kind === 'register') {
    if (!fields.password_confirmation)
      errors.password_confirmation = 'Konfirmasi kata sandi wajib diisi.'
    else if (fields.password !== fields.password_confirmation)
      errors.password_confirmation = 'Konfirmasi kata sandi belum sama.'
  }
  return errors
}

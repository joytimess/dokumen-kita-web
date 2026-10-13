import type { AuthKind } from '../types/auth'
export const prototypeMessages: Record<AuthKind, string> = {
  login: 'Form masuk valid. Login akan diproses setelah API autentikasi dihubungkan.',
  register:
    'Form pendaftaran valid. Pembuatan akun dan verifikasi menunggu API autentikasi dihubungkan. Belum ada akun dibuat atau email dikirim.',
  forgot: 'Form pemulihan valid. API autentikasi belum dihubungkan; belum ada email yang dikirim.',
}
export async function prototypeSubmit(kind: AuthKind) {
  await new Promise((resolve) => setTimeout(resolve, 350))
  return prototypeMessages[kind]
}

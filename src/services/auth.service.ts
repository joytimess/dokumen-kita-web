import { apiOrigin, http, mutation } from './http'
import type {
  LoginPayload,
  RegisterPayload,
  User,
  ForgotResponse,
  VerifyOtpPayload,
  VerifyOtpResponse,
  ResetPasswordPayload,
} from '../types/auth'
type UserResponse = { data: User }
function readUser(response: UserResponse): User {
  const user = response?.data
  if (
    !user ||
    typeof user.guid !== 'string' ||
    typeof user.name !== 'string' ||
    typeof user.email !== 'string' ||
    typeof user.email_verified !== 'boolean'
  )
    throw new Error('Respons identitas tidak valid.')
  return user
}
export const authApi = {
  async me() {
    return readUser((await http.get<UserResponse>(`${apiOrigin()}/api/v1/me`)).data)
  },
  async login(payload: LoginPayload) {
    return readUser(await mutation<UserResponse>('/api/v1/auth/login', payload))
  },
  async register(payload: RegisterPayload) {
    return readUser(await mutation<UserResponse>('/api/v1/auth/register', payload))
  },
  async resendVerification() {
    return (await mutation<{ data: { status: 'sent' } }>('/api/v1/auth/email/resend', {})).data
  },
  async forgot(email: string) {
    return (await mutation<{ data: ForgotResponse }>('/api/v1/auth/password/forgot', { email }))
      .data
  },
  async verifyOtp(payload: VerifyOtpPayload) {
    return (
      await mutation<{ data: VerifyOtpResponse }>('/api/v1/auth/password/verify-otp', payload)
    ).data
  },
  async resetPassword(payload: ResetPasswordPayload) {
    return (await mutation<{ data: { status: 'reset' } }>('/api/v1/auth/password/reset', payload))
      .data
  },
  async logout() {
    await mutation<void>('/api/v1/auth/logout', {})
  },
  google() {
    window.location.assign(`${apiOrigin()}/api/v1/auth/google/redirect?redirect=%2F`)
  },
}

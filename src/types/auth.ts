export interface User {
  guid: string
  name: string
  email: string
  email_verified: boolean
  login_methods?: ('email_password' | 'google')[]
  capabilities?: {
    can_change_name: boolean
    can_change_photo: boolean
    can_change_email: boolean
    can_change_password: boolean
  }
  photo_url?: string | null
}
export interface LoginPayload {
  email: string
  password: string
  remember: boolean
}
export interface RegisterPayload {
  name: string
  email: string
  password: string
  password_confirmation: string
}
export type AuthKind = 'login' | 'register'
export type FieldErrors = Record<string, string>
export interface ForgotResponse { status: 'accepted'; otp_expires_in: number; resend_after: number }
export interface VerifyOtpPayload { email: string; otp: string }
export interface VerifyOtpResponse { reset_token: string; expires_in: number }
export interface ResetPasswordPayload { email: string; reset_token: string; password: string; password_confirmation: string }
export interface RecoveryAdapter {
  forgot(email: string): Promise<ForgotResponse>
  verifyOtp(payload: VerifyOtpPayload): Promise<VerifyOtpResponse>
  resetPassword(payload: ResetPasswordPayload): Promise<{ status: 'reset' }>
}

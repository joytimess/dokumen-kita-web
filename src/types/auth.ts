export interface User {
  guid: string
  name: string
  email: string
  email_verified: boolean
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
export type AuthKind = 'login' | 'register' | 'forgot'
export type FieldErrors = Record<string, string>

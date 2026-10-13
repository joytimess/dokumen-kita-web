import { apiOrigin, http, mutation } from './http'
import type { LoginPayload, RegisterPayload, User } from '../types/auth'
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
    await mutation<UserResponse>('/api/v1/auth/login', payload)
    return this.me()
  },
  async register(payload: RegisterPayload) {
    await mutation<UserResponse>('/api/v1/auth/register', payload)
    return this.me()
  },
  async forgot(email: string) {
    await mutation('/api/v1/auth/password/forgot', { email })
  },
  async logout() {
    await mutation<void>('/api/v1/auth/logout', {})
  },
  google() {
    window.location.assign(`${apiOrigin()}/api/v1/auth/google/redirect?redirect=%2F`)
  },
}

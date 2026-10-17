import { apiOrigin, authMode, csrf, http, mutation } from './http'
import type { User } from '../types/auth'

type UserResponse = { data: User }

export const accountApi = {
  updateName: (name: string) =>
    mutation<UserResponse>('/api/v1/me/profile', { name }, 'patch').then((response) => response.data),
  uploadPhoto: (photo: File) => {
    const body = new FormData()
    body.append('photo', photo)
    return mutation<UserResponse>('/api/v1/me/photo', body).then((response) => response.data)
  },
  async deletePhoto() {
    if (authMode !== 'api') throw new Error('Workspace memerlukan mode API.')
    await csrf()
    return (await http.delete<UserResponse>(`${apiOrigin()}/api/v1/me/photo`)).data.data
  },
  async photo() {
    if (authMode !== 'api') throw new Error('Workspace memerlukan mode API.')
    return (await http.get<Blob>(`${apiOrigin()}/api/v1/me/photo`, { responseType: 'blob' })).data
  },
  requestEmailChange: (email: string) =>
    mutation<{ data: { status: 'pending'; expires_in: number; resend_after: number } }>(
      '/api/v1/me/email-change', { email },
    ).then((response) => response.data),
  changePassword: (password: string, password_confirmation: string) =>
    mutation<UserResponse>('/api/v1/me/password', { password, password_confirmation })
      .then((response) => response.data),
}

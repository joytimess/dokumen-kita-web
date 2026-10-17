import { apiOrigin, authMode, csrf, http, mutation } from './http'
import type { CategoryColor, DocumentCategory } from '../types/documents'

export interface CategoryPayload {
  name: string
  color_token: CategoryColor
  description: string | null
}

async function get<T>(path: string, params?: Record<string, string | number>) {
  if (authMode !== 'api') throw new Error('Workspace memerlukan mode API.')
  return (await http.get<T>(`${apiOrigin()}/api/v1${path}`, { params })).data
}

export const categoriesApi = {
  list: () => get<{ data: DocumentCategory[] }>('/categories').then((response) => response.data),
  create: (payload: CategoryPayload) =>
    mutation<{ data: DocumentCategory }>('/api/v1/categories', payload).then((response) => response.data),
  update: (guid: string, payload: CategoryPayload) =>
    mutation<{ data: DocumentCategory }>(`/api/v1/categories/${encodeURIComponent(guid)}`, payload, 'put')
      .then((response) => response.data),
  async delete(guid: string) {
    if (authMode !== 'api') throw new Error('Workspace memerlukan mode API.')
    await csrf()
    await http.delete(`${apiOrigin()}/api/v1/categories/${encodeURIComponent(guid)}`)
  },
}

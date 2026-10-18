import { apiOrigin, authMode, csrf, http, mutation } from './http'
import type { CategoryColor, DocumentCategory, Page } from '../types/documents'

export interface CategoryPageFilters {
  q?: string
  sortBy?: 'created_at' | 'name' | 'documents_count'
  sortDirection?: 'asc' | 'desc'
  page?: number
  perPage?: number
}

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
  listPage: (filters: CategoryPageFilters = {}) => get<Page<DocumentCategory>>('/categories', {
    page: filters.page ?? 1,
    per_page: filters.perPage ?? 10,
    sort_by: filters.sortBy ?? 'created_at',
    sort_direction: filters.sortDirection ?? 'desc',
    ...(filters.q ? { q: filters.q } : {}),
  }),
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

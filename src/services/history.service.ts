import { apiOrigin, authMode, http } from './http'
import type { Page } from '../types/documents'

export interface SigningHistoryEvent {
  guid: string
  action: 'assignment.signed' | 'version.revision_requested'
  occurred_at: string
  document: {
    guid: string | null
    title: string
    status: string
    owner: { guid: string; name: string; email: string }
  }
  version_guid: string | null
  actor_snapshot_available: boolean
  actor_snapshot: { name: string | null; email: string | null }
  can_access_document: boolean
  revision_reason?: string | null
}

async function get<T>(path: string, params?: Record<string, string | number>) {
  if (authMode !== 'api') throw new Error('Workspace memerlukan mode API.')
  return (await http.get<T>(`${apiOrigin()}/api/v1${path}`, { params })).data
}

export const historyApi = {
  list: (filters: { q?: string; date_from?: string; date_to?: string; page?: number; perPage?: number }) =>
    get<Page<SigningHistoryEvent>>('/me/history', {
      per_page: filters.perPage ?? 5,
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.date_from ? { date_from: filters.date_from } : {}),
      ...(filters.date_to ? { date_to: filters.date_to } : {}),
      page: filters.page ?? 1,
    }),
  detail: (guid: string) =>
    get<{ data: SigningHistoryEvent }>(`/me/history/${encodeURIComponent(guid)}`).then((response) => response.data),
}

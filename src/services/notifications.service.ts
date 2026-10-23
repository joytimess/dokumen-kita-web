import { apiOrigin, authMode, http, mutation } from './http'
import type { NotificationPage, NotificationReadResponse } from '../types/notifications'

function checkUnreadCount<T extends { meta: { unread_count: number } }>(response: T): T {
  if (!Number.isSafeInteger(response.meta?.unread_count) || response.meta.unread_count < 0)
    throw new Error('Jumlah notifikasi belum dibaca tidak valid.')
  return response
}

export const notificationsApi = {
  async list(page = 1) {
    if (authMode !== 'api') throw new Error('Workspace memerlukan mode API.')
    return checkUnreadCount((await http.get<NotificationPage>(`${apiOrigin()}/api/v1/notifications`, {
      params: { page, per_page: 20 },
    })).data)
  },
  async markRead(guid: string) {
    return checkUnreadCount(await mutation<NotificationReadResponse>(`/api/v1/notifications/${encodeURIComponent(guid)}/read`, {}, 'patch'))
  },
}

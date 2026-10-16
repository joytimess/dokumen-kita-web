import { apiOrigin, authMode, http, mutation } from './http'
import type { NotificationPage, NotificationReadResponse } from '../types/notifications'

export const notificationsApi = {
  async list(page = 1) {
    if (authMode !== 'api') throw new Error('Workspace memerlukan mode API.')
    return (await http.get<NotificationPage>(`${apiOrigin()}/api/v1/notifications`, {
      params: { page, per_page: 20 },
    })).data
  },
  async markRead(guid: string) {
    return mutation<NotificationReadResponse>(`/api/v1/notifications/${encodeURIComponent(guid)}/read`, {}, 'patch')
  },
}

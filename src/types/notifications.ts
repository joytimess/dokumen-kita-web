export interface UserNotification {
  guid: string
  event_type: string
  title: string
  message: string
  document_guid: string | null
  version_guid: string | null
  assignment_guid: string | null
  created_at: string
  read_at: string | null
}

export interface NotificationPage {
  data: UserNotification[]
  links: { first?: string | null; last?: string | null; prev?: string | null; next: string | null }
  meta: { current_page: number; last_page: number; per_page: number; total: number; unread_count: number }
}

export interface NotificationReadResponse {
  data: UserNotification
  meta: { unread_count: number }
}

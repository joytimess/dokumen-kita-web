export interface EditorData {
  blocks: { type: string; data: Record<string, unknown> }[]
}
export type DecorationPages = { mode: 'all' } | { mode: 'range'; ranges: [number, number][] }
export interface PageDecoration {
  image_url: string
  pages: DecorationPages
}
export interface Placeholder {
  guid?: string
  page_number: number
  x: number
  y: number
  width: number
  height: number
  needs_review?: boolean
}
export interface Assignment {
  guid: string
  version_guid: string
  document_guid?: string
  document_title?: string
  version_number?: number
  recipient_email: string
  sequence_number: number
  status: string
  claimed_at: string | null
  placeholders?: Placeholder[]
  read_confirmation?: { version_content_hash: string; confirmed_at: string } | null
  signature?: { guid: string; signed_at: string } | null
}
export interface DocumentVersion {
  guid: string
  document_guid: string
  document_title?: string
  is_current?: boolean
  version_number: number
  status: string
  preview_status: 'none' | 'queued' | 'ready' | 'stale' | 'failed'
  preview_source?: 'editor' | 'upload' | null
  preview_error_code?: string | null
  preview_error_message?: string | null
  finalization_error_code?: string | null
  conversion_status?: 'none' | 'queued' | 'processing' | 'ready' | 'failed'
  conversion_generation?: string | null
  conversion_error_code?: string | null
  conversion_warnings?: string[] | null
  conversion_page_count?: number | null
  editor_revision?: number
  content_hash?: string | null
  preview_page_count?: number | null
  assignments?: Assignment[]
  source_type?: string
  has_source?: boolean
  editor_data?: EditorData
  letterhead?: PageDecoration | null
  footer?: PageDecoration | null
  updated_at: string
  published_at: string | null
}
export interface DocumentRecord {
  guid: string
  public_reference: string
  title: string
  status: string
  owner_guid: string
  category_guid?: string | null
  category?: DocumentCategory | null
  current_version: DocumentVersion
  created_at: string
  updated_at: string
}
export type CategoryColor = 'gray' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple'
export interface DocumentCategory {
  guid: string
  name: string
  color_token: CategoryColor
  description: string | null
  documents_count?: number
  created_at?: string
  updated_at?: string
}
export interface Page<T> {
  data: T[]
  meta: { current_page: number; last_page: number; total: number; per_page: number }
  links: { next: string | null; prev: string | null }
}
export interface SignatureAsset {
  guid: string
  source_type: 'drawn' | 'upload'
  mime_type: string
  width: number
  height: number
  size_bytes: number
  image_url: string
  created_at: string
}
export interface DraftPayload {
  title?: string
  editor_data?: EditorData
  editor_revision?: number
}
export interface RevisionResult {
  previous_version_guid: string
  previous_status: string
  draft_version_guid: string
  draft_status: string
}
export interface AuditEvent {
  guid: string
  version_guid: string | null
  actor_guid: string | null
  action: string
  metadata: Record<string, unknown> | null
  created_at: string
}
export interface EmailNotification {
  guid: string
  version_guid: string
  assignment_guid: string | null
  recipient_email: string
  notification_type: string
  status: string
  attempt_count: number
  scheduled_at: string | null
  sent_at: string | null
  last_error_code: string | null
  created_at: string
}
export interface SignaturePayload {
  asset_guid: string
  version_content_hash: string
  confirmed: true
  idempotency_key: string
}

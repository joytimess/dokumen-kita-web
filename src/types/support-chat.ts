import type { WorkspaceLanguage } from '../services/workspace-language'

export interface ChatReference {
  type: 'document' | 'assignment'
  resource_id: string
  action: 'open_document' | 'open_signing'
  label: string
  document_id?: string
  version_id?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
  references?: ChatReference[]
  showReferences?: boolean
}

export interface ChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatError {
  kind: 'unauthenticated' | 'validation' | 'rate-limit' | 'unavailable'
  retryAt: number | null
}

export interface ChatReply {
  reply: string
  locale: WorkspaceLanguage
  suggested_questions: string[]
  requestId: string
  references?: ChatReference[]
  context?: string | null
  show_references?: boolean
}

export interface SupportChatProps {
  open: boolean
  messages: ChatMessage[]
  draft: string
  loading: boolean
  error: ChatError | null
  suggestions: string[]
  invitation: string
}

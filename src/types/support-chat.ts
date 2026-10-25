import type { WorkspaceLanguage } from '../services/workspace-language'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
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

import { authMode, mutation } from './http'
import type { WorkspaceLanguage } from './workspace-language'
import type { ChatHistoryEntry, ChatReference, ChatReply } from '../types/support-chat'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function chatReferencePath(reference: ChatReference): string | null {
  if (!uuid.test(reference.resource_id)) return null
  if (reference.type === 'document' && reference.action === 'open_document') return `/documents/${reference.resource_id}`
  if (reference.type === 'assignment' && reference.action === 'open_signing' && uuid.test(reference.document_id ?? '') && uuid.test(reference.version_id ?? '')) {
    return `/documents/${reference.document_id}/versions/${reference.version_id}/view`
  }
  return null
}

export const supportChatApi = {
  async send(message: string, locale: WorkspaceLanguage, signal?: AbortSignal, context?: string, history: ChatHistoryEntry[] = []): Promise<ChatReply> {
    if (authMode !== 'api') throw new Error('Workspace memerlukan mode API.')
    const response = await mutation<{
      data: { reply: string; locale: WorkspaceLanguage; suggested_questions: string[]; references?: ChatReference[]; context?: string | null; show_references?: boolean }
      meta: { request_id: string }
    }>('/api/v1/ai/chat', { message, locale, history: history.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 1000) })).filter(({ content }) => content.trim()), ...(context ? { context } : {}) }, 'post', {
      signal,
      headers: { 'Content-Type': 'application/json' },
    })
    const data = response?.data
    if (
      typeof data?.reply !== 'string' || !data.reply.trim() || data.reply.length > 12000 ||
      !['id', 'en'].includes(data.locale) || !Array.isArray(data.suggested_questions) ||
      !data.suggested_questions.every((question) => typeof question === 'string' && question.trim() && question.length <= 2000) ||
      typeof response.meta?.request_id !== 'string'
    ) throw new Error('Respons asisten tidak valid.')
    if (data.references !== undefined && (!Array.isArray(data.references) || data.references.length > 20 || !data.references.every((reference) =>
      reference && typeof reference.label === 'string' && reference.label.length <= 2000 && chatReferencePath(reference) !== null,
    ))) throw new Error('Referensi asisten tidak valid.')
    if (data.context != null && (typeof data.context !== 'string' || data.context.length > 12000)) throw new Error('Konteks asisten tidak valid.')
    if (data.show_references !== undefined && typeof data.show_references !== 'boolean') throw new Error('Presentasi asisten tidak valid.')
    return { reply: data.reply, locale: data.locale, suggested_questions: data.suggested_questions.slice(0, 6), requestId: response.meta.request_id,
      ...(data.references !== undefined ? { references: data.references } : {}), ...(data.context !== undefined ? { context: data.context } : {}),
      ...(data.show_references !== undefined ? { show_references: data.show_references } : {}) }
  },
}

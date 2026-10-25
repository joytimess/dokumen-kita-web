import { authMode, mutation } from './http'
import type { WorkspaceLanguage } from './workspace-language'
import type { ChatReply } from '../types/support-chat'

export const supportChatApi = {
  async send(message: string, locale: WorkspaceLanguage, signal?: AbortSignal): Promise<ChatReply> {
    if (authMode !== 'api') throw new Error('Workspace memerlukan mode API.')
    const response = await mutation<{
      data: { reply: string; locale: WorkspaceLanguage; suggested_questions: string[] }
      meta: { request_id: string }
    }>('/api/v1/ai/chat', { message, locale, history: [] }, 'post', {
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
    return { reply: data.reply, locale: data.locale, suggested_questions: data.suggested_questions.slice(0, 6), requestId: response.meta.request_id }
  },
}

import axios, { AxiosHeaders } from 'axios'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { supportChatApi } from '../services/support-chat.service'
import { language, type WorkspaceLanguage } from '../services/workspace-language'
import type { ChatError, ChatMessage } from '../types/support-chat'
import { useAuthStore } from './auth'

const storageKey = 'dokumen-kita-support-chat'
const starters: Record<WorkspaceLanguage, string[]> = {
  id: ['Bagaimana cara impor PDF atau DOCX?', 'Bagaimana cara menandatangani dokumen?'],
  en: ['How do I import a PDF or DOCX?', 'How do I sign a document?'],
}

export const useSupportChatStore = defineStore('support-chat', () => {
  const auth = useAuthStore()
  const open = ref(false)
  const messages = ref<ChatMessage[]>([])
  const draft = ref('')
  const loading = ref(false)
  const error = ref<ChatError | null>(null)
  const invitationDismissed = ref(false)
  const requestId = ref<string | null>(null)
  const receivedSuggestions = ref<Partial<Record<WorkspaceLanguage, string[]>>>({})
  const suggestions = computed(() => receivedSuggestions.value[language.value] ?? starters[language.value])
  let controller: AbortController | undefined
  let generation = 0
  let identity: string | undefined
  let failedMessage: ChatMessage | undefined

  function persist() {
    if (!identity) return
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({
        userGuid: identity,
        messages: messages.value.slice(-40),
        draft: draft.value.slice(0, 2000),
        invitationDismissed: invitationDismissed.value,
      }))
    } catch { /* The chat remains usable when browser storage is unavailable. */ }
  }

  function restore(userGuid: string) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null')
      if (!saved || saved.userGuid !== userGuid) return
      if (typeof saved.draft === 'string' && saved.draft.length <= 2000) draft.value = saved.draft
      invitationDismissed.value = saved.invitationDismissed === true
      if (Array.isArray(saved.messages)) {
        messages.value = saved.messages.slice(-40).filter((message: ChatMessage) =>
          message && typeof message.id === 'string' && message.id.length <= 100 &&
          ['user', 'assistant'].includes(message.role) && typeof message.text === 'string' &&
          message.text.length <= (message.role === 'user' ? 2000 : 12000) &&
          typeof message.createdAt === 'string' && message.createdAt.length <= 100 && Number.isFinite(Date.parse(message.createdAt)),
        ).map(({ id, role, text, createdAt }: ChatMessage) => ({ id, role, text, createdAt }))
        const last = messages.value.at(-1)
        if (last?.role === 'user') failedMessage = last
      }
    } catch { /* Ignore invalid or unavailable temporary storage. */ }
  }

  watch(() => auth.user?.guid, (next, previous) => {
    generation++
    controller?.abort()
    controller = undefined
    identity = undefined
    open.value = false
    messages.value = []
    draft.value = ''
    loading.value = false
    error.value = null
    requestId.value = null
    failedMessage = undefined
    invitationDismissed.value = false
    receivedSuggestions.value = {}
    if (previous || next) {
      if (next && !previous) restore(next)
      else {
        try { sessionStorage.removeItem(storageKey) } catch { /* Storage is optional. */ }
      }
    }
    identity = next
    persist()
  }, { immediate: true, flush: 'sync' })

  watch([messages, draft, invitationDismissed], persist, { deep: true, flush: 'sync' })
  onScopeDispose(() => { generation++; controller?.abort() })

  function append(role: ChatMessage['role'], text: string) {
    const message: ChatMessage = { id: crypto.randomUUID(), role, text, createdAt: new Date().toISOString() }
    messages.value = [...messages.value, message].slice(-40)
    return message
  }

  async function send(text?: string, retrying = false) {
    const message = (text ?? draft.value).trim()
    if (!identity || loading.value || !message || message.length > 2000 || error.value?.kind === 'unauthenticated' || (error.value?.retryAt ?? 0) > Date.now()) return
    if (text !== undefined && !retrying && !draft.value.trim()) draft.value = text
    const submittedDraft = draft.value
    const userMessage = failedMessage?.text === message ? failedMessage : append('user', message)
    failedMessage = undefined
    error.value = null
    loading.value = true
    const currentGeneration = generation
    const locale = language.value
    controller = new AbortController()
    try {
      const reply = await supportChatApi.send(message, locale, controller.signal)
      if (currentGeneration !== generation) return
      append('assistant', reply.reply)
      receivedSuggestions.value[reply.locale] = reply.suggested_questions
      requestId.value = reply.requestId
      if (draft.value === submittedDraft && submittedDraft.trim() === message) draft.value = ''
    } catch (cause) {
      if (currentGeneration !== generation) return
      failedMessage = userMessage
      const response = axios.isAxiosError(cause) ? cause.response : undefined
      let retryAt: number | null = null
      if (response?.status === 429) {
        const header = response.headers instanceof AxiosHeaders
          ? response.headers.get('retry-after')
          : response.headers['retry-after'] ?? response.headers['Retry-After']
        if (typeof header === 'string' || typeof header === 'number') {
          const seconds = Number(header)
          const timestamp = Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000 : Date.parse(String(header))
          if (Number.isFinite(timestamp)) retryAt = Math.max(Date.now(), timestamp)
        }
      }
      error.value = {
        kind: response?.status === 401 ? 'unauthenticated' : response?.status === 422 ? 'validation' : response?.status === 429 ? 'rate-limit' : 'unavailable',
        retryAt,
      }
    } finally {
      if (currentGeneration === generation) {
        loading.value = false
        controller = undefined
      }
    }
  }

  async function retry() {
    if (failedMessage) await send(failedMessage.text, true)
  }

  function openChat() { open.value = true; invitationDismissed.value = true }
  function closeChat() { open.value = false }
  function dismissInvitation() { invitationDismissed.value = true }

  return { open, messages, draft, loading, error, suggestions, invitationDismissed, requestId, send, retry, openChat, closeChat, dismissInvitation }
})

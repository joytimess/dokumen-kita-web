// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { nextTick } from 'vue'
import { AxiosError, AxiosHeaders } from 'axios'
import { useAuthStore } from '../src/stores/auth'
import { useSupportChatStore } from '../src/stores/support-chat'
import { language } from '../src/services/workspace-language'
import type { ChatReply } from '../src/types/support-chat'

const api = vi.hoisted(() => ({ send: vi.fn(), logout: vi.fn() }))
vi.mock('../src/services/support-chat.service', () => ({ supportChatApi: { send: api.send } }))
vi.mock('../src/services/auth.service', () => ({ authApi: { logout: api.logout } }))
vi.mock('../src/services/http', () => ({ authMode: 'api' }))

const key = 'dokumen-kita-support-chat'
const user = { guid: 'user-a', name: 'User', email: 'user@example.test', email_verified: true, photo_url: null }
const reply: ChatReply = { reply: 'Cara menandatangani dokumen.', locale: 'id', suggested_questions: ['Cara impor?'], requestId: 'request-1' }
let pinia: Pinia
function setup() {
  pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setUser(user)
  return { auth, chat: useSupportChatStore() }
}
async function settle() { for (let i = 0; i < 6; i++) { await Promise.resolve(); await nextTick() } }
function failure(status: number, retryAfter?: string) {
  return new AxiosError('request failed', undefined, undefined, undefined, { status, statusText: 'Error', data: {}, headers: new AxiosHeaders(retryAfter ? { 'Retry-After': retryAfter } : {}), config: { headers: new AxiosHeaders() } })
}

beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); language.value = 'id'; api.send.mockResolvedValue(reply); api.logout.mockResolvedValue(undefined) })
afterEach(() => { if (pinia) disposePinia(pinia); vi.useRealTimers(); vi.restoreAllMocks() })

it('submits the trimmed draft in the active language and displays only the real reply and backend suggestions', async () => {
  const { chat } = setup()
  chat.draft = '  Gimana cara ttd?  '
  await chat.send()
  expect(api.send).toHaveBeenCalledWith('Gimana cara ttd?', 'id', expect.any(AbortSignal))
  expect(chat.messages.map((message) => [message.role, message.text])).toEqual([['user', 'Gimana cara ttd?'], ['assistant', reply.reply]])
  expect(chat.suggestions).toEqual(['Cara impor?'])
  expect(chat.draft).toBe('')
  expect(chat.error).toBeNull()
})

it.each(['', '  \n\t ', 'x'.repeat(2001)])('does not send empty or over-limit drafts', async (draft) => {
  const { chat } = setup(); chat.draft = draft
  await chat.send()
  expect(api.send).not.toHaveBeenCalled()
  expect(chat.messages).toHaveLength(0)
  expect(chat.draft).toBe(draft)
})

it('accepts exactly 2000 characters', async () => {
  const { chat } = setup(); chat.draft = 'x'.repeat(2000)
  await chat.send()
  expect(api.send).toHaveBeenCalledOnce()
})

it('blocks duplicate requests while pending and preserves edits made during the request', async () => {
  let resolve!: (value: ChatReply) => void
  api.send.mockReturnValueOnce(new Promise<ChatReply>((done) => { resolve = done }))
  const { chat } = setup(); chat.draft = 'Pertanyaan pertama'
  const pending = chat.send()
  expect(chat.loading).toBe(true)
  chat.draft = 'Pertanyaan berikutnya'
  await chat.send(); await chat.retry()
  expect(api.send).toHaveBeenCalledOnce()
  resolve(reply); await pending
  expect(chat.loading).toBe(false)
  expect(chat.draft).toBe('Pertanyaan berikutnya')
})

it.each([[401, 'unauthenticated'], [422, 'validation'], [429, 'rate-limit'], [500, 'unavailable'], [503, 'unavailable']] as const)('retains draft and transcript without a fake answer on HTTP %i', async (status, kind) => {
  api.send.mockRejectedValueOnce(failure(status))
  const { chat } = setup(); chat.draft = 'Cara menandatangani?'
  await chat.send()
  expect(chat.error?.kind).toBe(kind)
  expect(chat.draft).toBe('Cara menandatangani?')
  expect(chat.messages.map((message) => message.role)).toEqual(['user'])
  expect(chat.loading).toBe(false)
})

it('recovers from a network error by retrying the failed message without duplicating its bubble or erasing a newer draft', async () => {
  api.send.mockRejectedValueOnce(new AxiosError('Network Error'))
  const { chat } = setup(); chat.draft = 'Pertanyaan gagal'
  await chat.send()
  expect(chat.error?.kind).toBe('unavailable')
  chat.draft = 'Draft baru'
  await chat.retry()
  expect(api.send.mock.calls.map((call) => call[0])).toEqual(['Pertanyaan gagal', 'Pertanyaan gagal'])
  expect(chat.messages.filter((message) => message.role === 'user')).toHaveLength(1)
  expect(chat.messages.at(-1)?.text).toBe(reply.reply)
  expect(chat.draft).toBe('Draft baru')
  expect(chat.error).toBeNull()
})

it('preserves an existing draft when a suggested question is submitted, fails and is retried', async () => {
  api.send.mockRejectedValueOnce(new AxiosError('Network Error'))
  const { chat } = setup(); chat.draft = 'Pertanyaan yang sedang ditulis'
  await chat.send('Bagaimana cara impor PDF atau DOCX?')
  expect(chat.draft).toBe('Pertanyaan yang sedang ditulis')
  expect(chat.messages[0]?.text).toBe('Bagaimana cara impor PDF atau DOCX?')
  await chat.retry()
  expect(chat.draft).toBe('Pertanyaan yang sedang ditulis')
  expect(chat.messages.filter((message) => message.role === 'user')).toHaveLength(1)
})

it('requires session recovery before sending again after HTTP 401', async () => {
  api.send.mockRejectedValueOnce(failure(401))
  const { chat } = setup(); chat.draft = 'Bantuan'
  await chat.send(); await chat.retry(); await chat.send('Pertanyaan berikutnya')
  expect(api.send).toHaveBeenCalledOnce()
  expect(chat.error?.kind).toBe('unauthenticated')
  expect(chat.draft).toBe('Bantuan')
})

it.each(['5', new Date('2026-10-24T00:00:05Z').toUTCString()])('honors Retry-After %s before retrying', async (retryAfter) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T00:00:00Z'))
  api.send.mockRejectedValueOnce(failure(429, retryAfter))
  const { chat } = setup(); chat.draft = 'Bantuan'
  await chat.send()
  expect(chat.error?.retryAt).toBe(Date.now() + 5000)
  await chat.retry(); await chat.send('Pertanyaan lain')
  expect(api.send).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(5001)
  await chat.retry()
  expect(api.send).toHaveBeenCalledTimes(2)
})

it('switches suggestions and requests with workspace locale without translating existing messages or making an extra request', async () => {
  const { chat } = setup(); await chat.send('Pertanyaan Indonesia')
  language.value = 'en'; await settle()
  expect(chat.suggestions).not.toContain('Cara impor?')
  expect(api.send).toHaveBeenCalledOnce()
  expect(chat.messages.at(-1)?.text).toBe(reply.reply)
  api.send.mockResolvedValueOnce({ ...reply, locale: 'en', reply: 'English answer', suggested_questions: ['How to import?'] })
  await chat.send('How can I sign?')
  expect(api.send).toHaveBeenLastCalledWith('How can I sign?', 'en', expect.any(AbortSignal))
  expect(chat.suggestions).toEqual(['How to import?'])
})

it('persists bounded transcript, draft and invitation suppression across a same-user reload', async () => {
  let { chat } = setup()
  await chat.send('Pertanyaan')
  chat.draft = 'Belum terkirim'; chat.dismissInvitation(); await settle()
  const saved = JSON.parse(sessionStorage.getItem(key)!)
  expect(saved.userGuid).toBe(user.guid)
  expect(saved.draft).toBe('Belum terkirim')
  expect(saved.invitationDismissed).toBe(true)
  const messages = chat.messages.map((message) => ({ ...message }))
  disposePinia(pinia)
  ;({ chat } = setup())
  expect(chat.messages).toEqual(messages)
  expect(chat.draft).toBe('Belum terkirim')
  expect(chat.invitationDismissed).toBe(true)
  for (let i = 0; i < 25; i++) await chat.send(`Pertanyaan ${i}`)
  await settle()
  expect(chat.messages.length).toBeLessThanOrEqual(40)
  expect(JSON.parse(sessionStorage.getItem(key)!).messages.length).toBeLessThanOrEqual(40)
})

it('cleans up on logout and switching identity, aborts pending requests and ignores late replies', async () => {
  let resolve!: (value: ChatReply) => void
  api.send.mockReturnValueOnce(new Promise<ChatReply>((done) => { resolve = done }))
  const { auth, chat } = setup(); chat.draft = 'Privat'; chat.openChat()
  const pending = chat.send()
  const signal = api.send.mock.calls[0]![2] as AbortSignal
  auth.setUser({ ...user, guid: 'user-b' }); await settle()
  expect(signal.aborted).toBe(true)
  expect(chat.messages).toHaveLength(0); expect(chat.draft).toBe(''); expect(chat.open).toBe(false)
  resolve(reply); await pending
  expect(chat.messages).toHaveLength(0)
  chat.draft = 'Akun B'; await settle()
  await auth.logout(); await settle()
  expect(chat.messages).toHaveLength(0); expect(chat.draft).toBe('')
  expect(sessionStorage.getItem(key)).toBeNull()
})

it('ignores a transcript belonging to another user or malformed storage without breaking chat', async () => {
  sessionStorage.setItem(key, JSON.stringify({ userGuid: 'another-user', draft: 'secret', messages: [{ role: 'assistant', text: 'secret' }] }))
  const { chat } = setup()
  expect(chat.draft).toBe(''); expect(chat.messages).toHaveLength(0)
  disposePinia(pinia); sessionStorage.setItem(key, '{broken-json')
  expect(setup().chat.messages).toHaveLength(0)
})

it('keeps chat usable when sessionStorage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage unavailable') })
  const { chat } = setup(); chat.draft = 'Bantuan'
  await chat.send(); await settle()
  expect(chat.messages.at(-1)?.text).toBe(reply.reply)
})

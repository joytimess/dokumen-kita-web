import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { http } from '../src/services/http'
import { chatReferencePath, supportChatApi } from '../src/services/support-chat.service'
import type { ChatHistoryEntry } from '../src/types/support-chat'

vi.mock('../src/services/http', async (original) => ({ ...await original<typeof import('../src/services/http')>(), authMode: 'api' }))
const adapter = http.defaults.adapter
const payload = { data: { reply: 'Jawaban canonical.', locale: 'id', suggested_questions: ['Cara impor?'] }, meta: { request_id: 'request-1' } }

beforeEach(() => { vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test') })
afterEach(() => { http.defaults.adapter = adapter; vi.unstubAllEnvs() })

const guid = '00000000-0000-4000-8000-000000000001'
const reference = { type: 'document', resource_id: guid, action: 'open_document', label: 'Kontrak' } as const

it('sends bounded server context and accepts only known navigation references', async () => {
  http.defaults.adapter = async (config) => {
    if (config.method === 'post') expect(JSON.parse(config.data).context).toBe('encrypted-context')
    return { config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: config.method === 'post' ? { ...payload, data: { ...payload.data, references: [reference], context: 'next-context' } } : null }
  }
  const result = await supportChatApi.send('Yang tadi?', 'id', undefined, 'encrypted-context')
  expect(result.references).toEqual([reference])
  expect(result.context).toBe('next-context')
  expect(chatReferencePath(reference)).toBe(`/documents/${guid}`)
  expect(chatReferencePath({ ...reference, resource_id: 'https://attacker.test' })).toBeNull()
  expect(chatReferencePath({ type: 'assignment', action: 'open_signing', resource_id: guid, document_id: guid, version_id: guid, label: 'Sign' })).toBe(`/documents/${guid}/versions/${guid}/view`)
})

it('sends only the six most recent bounded history entries and keeps presentation separate from facts', async () => {
  const history: ChatHistoryEntry[] = Array.from({ length: 8 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `${i}:` + 'x'.repeat(1100) }))
  http.defaults.adapter = async (config) => {
    if (config.method === 'post') {
      const sent = JSON.parse(config.data)
      expect(sent.history).toEqual(history.slice(-6).map(({ role, content }) => ({ role, content: content.slice(0, 1000) })))
      expect(sent.history.every((item: ChatHistoryEntry) => Object.keys(item).length === 2)).toBe(true)
    }
    return { config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: config.method === 'post' ? { ...payload, data: { ...payload.data, references: [reference], show_references: false, results: { signers: [{ email: 'not-a-second-bubble@example.test' }] } } } : null }
  }
  const result = await supportChatApi.send('Dia sudah?', 'id', undefined, undefined, history)
  expect(result.show_references).toBe(false)
  expect(result.references).toEqual([reference])
  expect(result).not.toHaveProperty('results')
})

it.each([
  { references: [{ ...reference, resource_id: '../private' }] },
  { references: [{ ...reference, action: 'delete_document' }] },
  { references: [{ ...reference, type: 'assignment', action: 'open_signing' }] },
  { references: Array(21).fill(reference) },
  { context: 'x'.repeat(12001) },
  { show_references: 'false' },
])('rejects invalid references or oversized context', async (extra) => {
  http.defaults.adapter = async (config) => ({ config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: config.method === 'post' ? { ...payload, data: { ...payload.data, ...extra } } : null })
  await expect(supportChatApi.send('Cari dokumen', 'id')).rejects.toThrow()
})

it('uses the existing Sanctum client and JSON endpoint with only message, active locale and empty history', async () => {
  const requests: string[] = []
  const controller = new AbortController()
  http.defaults.adapter = async (config) => {
    requests.push(config.url!)
    expect(config.withCredentials).toBe(true)
    expect(config.withXSRFToken).toBe(true)
    if (config.method === 'post') {
      expect(config.url).toBe('https://api.example.test/api/v1/ai/chat')
      expect(JSON.parse(config.data)).toEqual({ message: 'Gimana cara ttd?', locale: 'id', history: [] })
      expect(config.headers.get('Accept')).toBe('application/json')
      expect(config.headers.get('Content-Type')).toBe('application/json')
      expect(config.signal).toBe(controller.signal)
    }
    return { config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: config.method === 'post' ? payload : null }
  }
  expect(await supportChatApi.send('Gimana cara ttd?', 'id', controller.signal)).toEqual({ reply: 'Jawaban canonical.', locale: 'id', suggested_questions: ['Cara impor?'], requestId: 'request-1' })
  expect(requests).toEqual(['https://api.example.test/sanctum/csrf-cookie', 'https://api.example.test/api/v1/ai/chat'])
})

it('treats a fallback HTTP 200 as a valid assistant reply and parses the nested envelope in English', async () => {
  http.defaults.adapter = async (config) => ({ config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: config.method === 'post' ? { data: { reply: 'Please ask a specific question about Dokumen Kita.', locale: 'en', suggested_questions: [] }, meta: { request_id: 'fallback-id' } } : null })
  expect(await supportChatApi.send('what about that?', 'en')).toEqual({ reply: 'Please ask a specific question about Dokumen Kita.', locale: 'en', suggested_questions: [], requestId: 'fallback-id' })
})

it('retains the shared single CSRF retry for expired tokens', async () => {
  let posts = 0
  let csrf = 0
  http.defaults.adapter = async (config) => {
    if (config.method === 'post' && ++posts === 1) throw new AxiosError('expired', undefined, config, undefined, { config, status: 419, statusText: 'Expired', headers: new AxiosHeaders(), data: {} })
    if (config.method === 'get') csrf++
    return { config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: config.method === 'post' ? payload : null }
  }
  await supportChatApi.send('Bantuan', 'id')
  expect(posts).toBe(2)
  expect(csrf).toBe(2)
})

it.each([
  { reply: 'incorrect root-level reply', locale: 'id', suggested_questions: [] },
  { data: { ...payload.data, reply: null }, meta: payload.meta },
  { data: { ...payload.data, locale: 'fr' }, meta: payload.meta },
  { data: { ...payload.data, suggested_questions: ['valid', 3] }, meta: payload.meta },
])('rejects a malformed response rather than inventing a successful answer', async (data) => {
  http.defaults.adapter = async (config) => ({ config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: config.method === 'post' ? data : null })
  await expect(supportChatApi.send('Bantuan', 'id')).rejects.toThrow()
})

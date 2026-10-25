import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { http } from '../src/services/http'
import { supportChatApi } from '../src/services/support-chat.service'

vi.mock('../src/services/http', async (original) => ({ ...await original<typeof import('../src/services/http')>(), authMode: 'api' }))
const adapter = http.defaults.adapter
const payload = { data: { reply: 'Jawaban canonical.', locale: 'id', suggested_questions: ['Cara impor?'] }, meta: { request_id: 'request-1' } }

beforeEach(() => { vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test') })
afterEach(() => { http.defaults.adapter = adapter; vi.unstubAllEnvs() })

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

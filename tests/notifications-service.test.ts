import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AxiosHeaders } from 'axios'
import { http } from '../src/services/http'
import { notificationsApi } from '../src/services/notifications.service'

vi.mock('../src/services/http', async (original) => ({ ...await original<typeof import('../src/services/http')>(), authMode: 'api' }))
const adapter = http.defaults.adapter
beforeEach(() => { vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000') })
afterEach(() => { http.defaults.adapter = adapter; vi.unstubAllEnvs() })

it('uses the existing paginated endpoint and server unread metadata instead of total or row count', async () => {
  http.defaults.adapter = async (config) => {
    expect(config.url).toBe('http://localhost:8000/api/v1/notifications')
    expect(config.params).toEqual({ page: 1, per_page: 20 })
    return { config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: {
      data: [], meta: { current_page: 1, last_page: 5, total: 99, per_page: 20, unread_count: 3 }, links: { next: '?page=2' },
    } }
  }
  expect((await notificationsApi.list()).meta.unread_count).toBe(3)
})

it.each([undefined, null, -1, '2', 1.5])('rejects an invalid unread count %s instead of displaying a guessed count', async (unreadCount) => {
  http.defaults.adapter = async (config) => ({ config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: { data: [], meta: { unread_count: unreadCount } } })
  await expect(notificationsApi.list()).rejects.toThrow('Jumlah notifikasi belum dibaca tidak valid.')
})

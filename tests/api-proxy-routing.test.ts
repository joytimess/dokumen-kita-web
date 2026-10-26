import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'

beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_AUTH_MODE', 'api')
  vi.stubEnv('VITE_API_BASE_URL', 'https://api-staging.dokumenkita.online')
  vi.stubEnv('VITE_DEV_API_PROXY', 'true')
  vi.stubEnv('MODE', 'development')
  vi.stubEnv('DEV', true)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each([
  { command: 'serve' as const, mode: 'development', isPreview: false, enabled: true },
  { command: 'serve' as const, mode: 'development', isPreview: true, enabled: false },
  { command: 'serve' as const, mode: 'staging', isPreview: false, enabled: false },
  { command: 'build' as const, mode: 'production', isPreview: false, enabled: false },
  { command: 'build' as const, mode: 'staging', isPreview: false, enabled: false },
  { command: 'build' as const, mode: 'development', isPreview: false, enabled: false },
])('includes the proxy only for development serve: $command/$mode/preview=$isPreview', async ({ command, mode, isPreview, enabled }) => {
  vi.stubEnv('VITE_DEV_PROXY_ORIGIN', 'https://staging.dokumenkita.online')
  const { default: config } = await import('../vite.config')
  if (typeof config !== 'function') throw new Error('Expected Vite config factory')
  const result = await config({ command, mode, isPreview })
  expect(result.plugins?.flat().some((plugin) => plugin && 'name' in plugin && plugin.name === 'local-sanctum-api-proxy')).toBe(enabled)
  expect(result.server?.proxy).toBeUndefined()
})

it('routes login, registration, identity, logout and every private image through localhost', async () => {
  const { http, apiOrigin, backendOrigin } = await import('../src/services/http')
  const { authApi } = await import('../src/services/auth.service')
  const { accountApi } = await import('../src/services/account.service')
  const { documentsApi } = await import('../src/services/documents.service')
  const calls: InternalAxiosRequestConfig[] = []
  const user = { guid: 'user', name: 'Test', email: 'test@example.test', email_verified: true }
  const png = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], { type: 'image/png' })
  http.defaults.adapter = async (config) => {
    calls.push(config)
    return { config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: config.responseType === 'blob' ? png : { data: user } }
  }
  expect(apiOrigin()).toBe('')
  expect(backendOrigin()).toBe('https://api-staging.dokumenkita.online')
  await authApi.login({ email: user.email, password: 'test-password', remember: false })
  await authApi.register({ name: user.name, email: user.email, password: 'test-password', password_confirmation: 'test-password' })
  await authApi.me()
  await authApi.logout()
  for (const load of [() => accountApi.photo(), () => documentsApi.assetImage('asset'),
    () => documentsApi.decorationImage('version', 'letterhead'), () => documentsApi.decorationImage('version', 'footer')])
    expect(await load()).toBe(png)
  expect(calls.map((call) => call.url)).toEqual([
    '/sanctum/csrf-cookie', '/api/v1/auth/login', '/sanctum/csrf-cookie', '/api/v1/auth/register',
    '/api/v1/me', '/sanctum/csrf-cookie', '/api/v1/auth/logout', '/api/v1/me/photo',
    '/api/v1/signature-assets/asset/image', '/api/v1/versions/version/decorations/letterhead/image',
    '/api/v1/versions/version/decorations/footer/image',
  ])
  expect(calls.every((call) => call.withCredentials && call.withXSRFToken)).toBe(true)
  expect(calls.filter((call) => call.responseType === 'blob')).toHaveLength(4)
})

it.each([
  { dev: false, mode: 'production', enabled: 'true' },
  { dev: false, mode: 'staging', enabled: 'true' },
  { dev: false, mode: 'development', enabled: 'true' },
  { dev: true, mode: 'staging', enabled: 'true' },
  { dev: true, mode: 'development', enabled: 'false' },
])('uses the direct API origin for $mode, DEV=$dev, proxy=$enabled', async ({ dev, mode, enabled }) => {
  vi.stubEnv('DEV', dev); vi.stubEnv('MODE', mode); vi.stubEnv('VITE_DEV_API_PROXY', enabled)
  const { apiOrigin } = await import('../src/services/http')
  expect(apiOrigin()).toBe('https://api-staging.dokumenkita.online')
})

it('keeps Google navigation on the backend origin rather than claiming a localhost OAuth session', async () => {
  const assign = vi.fn()
  vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { origin: 'http://localhost:5173', assign } }))
  const { authApi } = await import('../src/services/auth.service')
  await authApi.google('/documents')
  expect(assign).toHaveBeenCalledWith(expect.stringContaining('https://api-staging.dokumenkita.online/api/v1/auth/google/redirect?'))
})

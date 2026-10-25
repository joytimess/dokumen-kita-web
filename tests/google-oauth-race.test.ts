import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AxiosHeaders, isCancel, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
function response(config: InternalAxiosRequestConfig): AxiosResponse {
  return { config, status: 204, data: '', statusText: 'No Content', headers: new AxiosHeaders() }
}
let assign: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
  vi.stubEnv('DEV', false)
  assign = vi.fn()
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    location: { origin: 'https://app.example.test', assign },
  }))
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it.each(['/api/v1/me', '/sanctum/csrf-cookie', '/api/v1/auth/login', '/api/v1/auth/logout'])(
  'waits for the late %s cookie before OAuth and blocks new session requests', async (path) => {
    const { http } = await import('../src/services/http')
    const { authApi } = await import('../src/services/auth.service')
    const late = deferred<void>()
    let cookie = 'original-session'
    const requests: string[] = []
    http.defaults.adapter = async (config) => {
      requests.push(config.url!)
      await late.promise
      cookie = 'late-session'
      return response(config)
    }
    assign.mockImplementation(() => {
      expect(cookie).toBe('late-session')
      cookie = 'oauth-session'
    })
    const pending = http.request({ url: path, method: path.includes('/auth/') ? 'post' : 'get' })
    const google = authApi.google('/documents')
    await Promise.resolve()
    expect(assign).not.toHaveBeenCalled()
    const blocked = http.get('/sanctum/csrf-cookie').catch((error: unknown) => error)
    late.resolve()
    await Promise.all([pending, google])
    expect(isCancel(await blocked)).toBe(true)
    expect(requests).toEqual([path])
    expect(assign).toHaveBeenCalledTimes(1)
    expect(cookie).toBe('oauth-session')
  },
)

it('starts one Google redirect for a double-click and accepts a new attempt after pageshow', async () => {
  const { authApi } = await import('../src/services/auth.service')
  await Promise.all([authApi.google('/first'), authApi.google('/second')])
  expect(assign).toHaveBeenCalledTimes(1)
  expect(assign.mock.calls[0]![0]).toContain(encodeURIComponent('/first'))
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
  await authApi.google('/third')
  expect(assign).toHaveBeenCalledTimes(2)
})

it('blocks a login POST queued behind a pending CSRF response when Google starts', async () => {
  const { http } = await import('../src/services/http')
  const { authApi } = await import('../src/services/auth.service')
  const late = deferred<void>()
  const requests: string[] = []
  http.defaults.adapter = async (config) => {
    requests.push(config.url!)
    await late.promise
    return response(config)
  }
  const login = authApi.login({ email: 'user@example.test', password: 'secret', remember: false })
    .catch((error: unknown) => error)
  const google = authApi.google()
  late.resolve()
  await google
  expect(isCancel(await login)).toBe(true)
  expect(requests).toEqual(['https://api.example.test/sanctum/csrf-cookie'])
  expect(assign).toHaveBeenCalledTimes(1)
})

it('releases the navigation lock if navigation fails', async () => {
  const { authApi } = await import('../src/services/auth.service')
  assign.mockImplementationOnce(() => { throw new Error('navigation failed') })
  await expect(authApi.google()).rejects.toThrow('navigation failed')
  await authApi.google()
  expect(assign).toHaveBeenCalledTimes(2)
})

it('waits for a failed session request to settle before navigating', async () => {
  const { http } = await import('../src/services/http')
  const { authApi } = await import('../src/services/auth.service')
  const late = deferred<void>()
  http.defaults.adapter = async () => { await late.promise; throw new Error('offline') }
  const pending = http.get('/api/v1/me').catch((error: unknown) => error)
  const google = authApi.google()
  expect(assign).not.toHaveBeenCalled()
  late.resolve()
  await Promise.all([pending, google])
  expect(assign).toHaveBeenCalledTimes(1)
})

it('uses the configured backend for both OAuth and identity requests in development', async () => {
  vi.stubEnv('DEV', true)
  vi.stubGlobal('window', Object.assign(new EventTarget(), {
    location: { origin: 'http://localhost:5173', assign },
  }))
  const { apiOrigin, http } = await import('../src/services/http')
  const { authApi } = await import('../src/services/auth.service')
  expect(apiOrigin()).toBe('https://api.example.test')
  const user = { guid: 'oauth-user', name: 'User', email: 'user@example.test', email_verified: true }
  http.defaults.adapter = async (config) => {
    expect(config.url).toBe('https://api.example.test/api/v1/me')
    expect(config.withCredentials).toBe(true)
    expect(config.withXSRFToken).toBe(true)
    return { ...response(config), status: 200, data: { data: user } }
  }
  expect(await authApi.me()).toEqual(user)
  await authApi.google('/documents')
  expect(new URL(assign.mock.calls[0]![0]).origin).toBe('https://api.example.test')
  expect(new URL(assign.mock.calls[0]![0]).pathname).toBe('/api/v1/auth/google/redirect')
})

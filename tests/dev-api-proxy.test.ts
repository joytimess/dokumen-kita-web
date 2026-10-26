// @vitest-environment happy-dom
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { createServer as createHttpServer, request, type Server, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createServer, type ViteDevServer } from 'vite'
import type { Window } from 'happy-dom'
import { devApiProxy } from '../build/devApiProxy'

const stagingOrigin = 'https://staging.dokumenkita.online'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')
const user = { guid: 'fixture-user', name: 'Fixture', email: 'fixture@example.test', email_verified: true }
const sessions = new Map<string, { token: string; authenticated: boolean }>()
const received: Array<{ path: string; method: string; headers: IncomingHttpHeaders }> = []
let upstream: Server, vite: ViteDevServer, origin: string, serial = 0

function raw(path: string, method = 'GET', headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
    const call = request(`${origin}${path}`, { method, headers }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({ status: response.statusCode!, headers: response.headers, body: Buffer.concat(chunks) }))
    })
    call.on('error', reject); call.end()
  })
}
beforeAll(async () => {
  upstream = createHttpServer(async (request, response) => {
    const path = request.url!, method = request.method!
    received.push({ path, method, headers: request.headers })
    const cookies = Object.fromEntries((request.headers.cookie ?? '').split(';').filter(Boolean).map((pair) => {
      const index = pair.indexOf('='); return [pair.slice(0, index).trim(), pair.slice(index + 1)]
    }))
    let id = cookies['dokumen-kita-staging-session'] ?? '', session = sessions.get(id)
    response.setHeader('Content-Type', 'application/json')
    if (request.headers.origin !== stagingOrigin || request.headers.referer !== `${stagingOrigin}/`) {
      response.writeHead(403); response.end(); return
    }
    const setCookies = () => response.setHeader('Set-Cookie', [
      `XSRF-TOKEN=${encodeURIComponent(session!.token)}; Path=/; Domain=.dokumenkita.online; Secure; SameSite=None`,
      `dokumen-kita-staging-session=${id}; Path=/; Domain=api-staging.dokumenkita.online; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Secure; HttpOnly; SameSite=Lax`,
    ])
    if (path === '/sanctum/csrf-cookie') {
      if (!session) {
        id = `session-${++serial}`; session = { token: `csrf/token-${serial}=`, authenticated: false }; sessions.set(id, session)
      }
      setCookies(); response.writeHead(204); response.end(); return
    }
    // Model Laravel 13's origin shortcut so a forwarded same-origin header would fail the CSRF regression.
    if (method === 'POST' && request.headers['sec-fetch-site'] !== 'same-origin' &&
      (!session || request.headers['x-xsrf-token'] !== session.token)) {
      response.writeHead(419); response.end(JSON.stringify({ error: { code: 'CSRF_TOKEN_MISMATCH' } })); return
    }
    if (path === '/api/v1/auth/login' || path === '/api/v1/auth/register') {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(chunk)
      const payload = JSON.parse(Buffer.concat(chunks).toString())
      if (payload.password !== 'fixture-password') { response.writeHead(422); response.end('{}'); return }
      sessions.delete(id); id = `session-${++serial}`
      session = { ...session!, authenticated: true }; sessions.set(id, session)
      setCookies(); response.end(JSON.stringify({ data: user })); return
    }
    if (!session?.authenticated) { response.writeHead(401); response.end('{}'); return }
    if (path === '/api/v1/auth/logout') {
      sessions.delete(id)
      response.setHeader('Set-Cookie', 'dokumen-kita-staging-session=; Path=/; Domain=.dokumenkita.online; Max-Age=0; Secure; HttpOnly; SameSite=None')
      response.writeHead(204); response.end(); return
    }
    if (path === '/api/v1/me') { response.end(JSON.stringify({ data: user })); return }
    if (path.endsWith('/image') || path === '/api/v1/me/photo') {
      response.setHeader('Content-Type', 'image/png'); response.end(png); return
    }
    response.writeHead(404); response.end()
  })
  await new Promise<void>((resolve) => upstream.listen(0, 'localhost', resolve))
  const target = `http://localhost:${(upstream.address() as AddressInfo).port}`
  vite = await createServer({
    configFile: false, envFile: false, appType: 'custom', logLevel: 'silent',
    plugins: [devApiProxy(target, stagingOrigin)],
    server: { host: 'localhost', port: 0, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  await vite.listen()
  origin = `http://localhost:${(vite.httpServer!.address() as AddressInfo).port}`
})
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('DEV', true); vi.stubEnv('MODE', 'development')
  vi.stubEnv('VITE_DEV_API_PROXY', 'true'); vi.stubEnv('VITE_AUTH_MODE', 'api')
  vi.stubEnv('VITE_API_BASE_URL', 'https://api-staging.dokumenkita.online')
  ;(window as unknown as Window).happyDOM.setURL(`${origin}/login`)
  sessions.clear(); received.length = 0
})
afterEach(() => { vi.unstubAllEnvs() })
afterAll(async () => {
  await vite?.close()
  if (upstream) await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()))
})

it('rewrites staging cookies to host-only HTTP localhost while preserving HttpOnly and expiry', async () => {
  const response = await raw('/sanctum/csrf-cookie', 'GET', { Referer: `${origin}/login` })
  expect(response.status).toBe(204)
  const cookies = response.headers['set-cookie']!
  expect(cookies).toHaveLength(2)
  expect(cookies.every((cookie) => !/;\s*(domain=|secure(?:;|$))/i.test(cookie))).toBe(true)
  expect(cookies.every((cookie) => /;\s*SameSite=Lax/i.test(cookie))).toBe(true)
  expect(cookies[0]).not.toMatch(/httponly/i)
  expect(cookies[1]).toMatch(/;\s*HttpOnly/i)
  expect(cookies[1]).toContain('Expires=Wed, 21 Oct 2037 07:28:00 GMT')
})

it.each(['login', 'register'] as const)('maintains an HttpOnly session and automatic Axios XSRF through %s, /me, private Blob images and logout', async (method) => {
  const { authApi } = await import('../src/services/auth.service')
  const { accountApi } = await import('../src/services/account.service')
  const { documentsApi } = await import('../src/services/documents.service')
  const { http } = await import('../src/services/http')
  http.defaults.adapter = 'xhr'
  const payload = { name: user.name, email: user.email, password: 'fixture-password', password_confirmation: 'fixture-password', remember: false }
  expect(await authApi[method](payload)).toEqual(user)
  expect(document.cookie).toContain('XSRF-TOKEN=')
  expect(document.cookie).not.toContain('dokumen-kita-staging-session')
  expect(await authApi.me()).toEqual(user)
  expect(await authApi.me()).toEqual(user)
  for (const load of [() => accountApi.photo(), () => documentsApi.assetImage('asset'),
    () => documentsApi.decorationImage('version', 'letterhead'), () => documentsApi.decorationImage('version', 'footer')]) {
    const blob = await load()
    expect(blob.type).toBe('image/png')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array(png))
  }
  const post = received.find((call) => call.path === `/api/v1/auth/${method}`)!
  expect(post.headers['x-xsrf-token']).toMatch(/^csrf\/token-\d+=$/)
  expect(post.headers.cookie).toContain('dokumen-kita-staging-session=')
  expect(received.every((call) => call.headers['sec-fetch-site'] === undefined)).toBe(true)
  await authApi.logout()
  await expect(authApi.me()).rejects.toMatchObject({ response: { status: 401 } })
  expect(document.cookie).not.toContain('dokumen-kita-staging-session')
})

it('rejects missing and incorrect CSRF tokens even if the local request claims same-origin', async () => {
  const response = await raw('/sanctum/csrf-cookie')
  const cookie = response.headers['set-cookie']!.map((value) => value.split(';')[0]).join('; ')
  for (const token of ['', 'invalid']) {
    const rejected = await raw('/api/v1/auth/login', 'POST', {
      Origin: origin, Cookie: cookie, 'Sec-Fetch-Site': 'same-origin', 'X-XSRF-TOKEN': token,
    })
    expect(rejected.status).toBe(419)
  }
  expect(received.every((call) => call.headers['sec-fetch-site'] === undefined)).toBe(true)
})

it.each([
  { Origin: 'https://attacker.example' },
  { Origin: 'null' },
  { Origin: 'http://localhost:1' },
  { Referer: 'https://attacker.example/form' },
  { Referer: 'invalid-url' },
  { 'Sec-Fetch-Site': 'cross-site' },
  {},
])('rejects an untrusted local mutation before translating Origin/Referer: %j', async (headers) => {
  const response = await raw('/api/v1/auth/login', 'POST', headers)
  expect(response.status).toBe(403)
  expect(received).toHaveLength(0)
})

it('rejects cross-site private GETs and spoofed Host values', async () => {
  expect((await raw('/api/v1/me', 'GET', { Origin: 'https://attacker.example' })).status).toBe(403)
  expect((await raw('/api/v1/me', 'GET', { Host: 'attacker.example', Origin: origin })).status).toBe(403)
  expect(received).toHaveLength(0)
})

import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer as createHttpServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createServer, type ViteDevServer } from 'vite'
import { devApiProxy } from '../build/devApiProxy'
import { documentsApi } from '../src/services/documents.service'
import { http } from '../src/services/http'

// Synthetic PNG produced and decoded by the accompanying Laravel audit harness.
const png = readFileSync(new URL('../audits/signature-asset-binary-2026-10-26/fixture-png-upload.png', import.meta.url))
const prefixed = Buffer.concat([Buffer.from([0x0d, 0x0a]), png])
const path = '/api/v1/signature-assets/audit-fixture/image'
const originalAdapter = http.defaults.adapter
let upstream: Server, vite: ViteDevServer, origin: string, payload = png

beforeAll(async () => {
  upstream = createHttpServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': payload.length })
    response.end(payload)
  })
  await new Promise<void>((resolve) => upstream.listen(0, 'localhost', resolve))
  vite = await createServer({
    configFile: false, envFile: false, appType: 'custom', logLevel: 'silent',
    plugins: [devApiProxy(`http://localhost:${(upstream.address() as AddressInfo).port}`, 'https://staging.dokumenkita.online')],
    server: { host: 'localhost', port: 0, watch: null, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  await vite.listen()
  origin = `http://localhost:${(vite.httpServer!.address() as AddressInfo).port}`
})

afterEach(() => { http.defaults.adapter = originalAdapter; vi.unstubAllEnvs() })
afterAll(async () => {
  await vite?.close()
  if (upstream) await new Promise<void>((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()))
})

function raw() {
  return new Promise<Buffer>((resolve, reject) => {
    request(`${origin}${path}`, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    }).on('error', reject).end()
  })
}

it.each([false, true])('preserves every upstream byte through the real Vite proxy, CRLF=%s', async (withPrefix) => {
  payload = withPrefix ? prefixed : png
  const received = await raw()
  expect(received).toEqual(payload)
  expect(received.length).toBe(payload.length)
  expect(createHash('sha256').update(received).digest('hex')).toBe(createHash('sha256').update(payload).digest('hex'))
})

it('returns the exact PNG as a Blob through HTTP and the shared Axios pipeline', async () => {
  payload = png
  vi.stubEnv('VITE_AUTH_MODE', 'api')
  vi.stubEnv('VITE_API_BASE_URL', origin)
  vi.stubEnv('VITE_DEV_API_PROXY', 'false')
  http.defaults.adapter = 'fetch'
  const blob = await documentsApi.assetImage('audit-fixture')
  const bytes = Buffer.from(await blob.arrayBuffer())
  expect(blob.type).toBe('image/png')
  expect(blob.size).toBe(png.length)
  expect(bytes).toEqual(png)
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(createHash('sha256').update(png).digest('hex'))
})

it('rejects the observed CRLF-prefixed HTTP PNG and retains the complete corrupt Blob for diagnosis', async () => {
  payload = prefixed
  vi.stubEnv('VITE_AUTH_MODE', 'api')
  vi.stubEnv('VITE_API_BASE_URL', origin)
  vi.stubEnv('VITE_DEV_API_PROXY', 'false')
  http.defaults.adapter = 'fetch'
  const error = await documentsApi.assetImage('audit-fixture').catch((cause: unknown) => cause)
  expect(error).toMatchObject({ code: 'ERR_BAD_RESPONSE', response: { status: 200 } })
  const blob = (error as { response: { data: Blob } }).response.data
  expect(blob).toBeInstanceOf(Blob)
  expect(Buffer.from(await blob.arrayBuffer())).toEqual(prefixed)
  expect(blob.size).toBe(png.length + 2)
})

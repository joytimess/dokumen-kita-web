import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'node:http'
import { AxiosError, AxiosHeaders } from 'axios'
import { http } from '../src/services/http'
import { accountApi } from '../src/services/account.service'
import { documentsApi } from '../src/services/documents.service'

vi.hoisted(() => { vi.stubEnv('VITE_AUTH_MODE', 'api') })

const adapter = http.defaults.adapter
const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'))
const images = [
  { name: 'profile', path: '/api/v1/me/photo', load: () => accountApi.photo() },
  { name: 'signature', path: '/api/v1/signature-assets/asset/image', load: (signal?: AbortSignal) => documentsApi.assetImage('asset', signal) },
  ...(['letterhead', 'footer'] as const).map((kind) => ({
    name: kind, path: `/api/v1/versions/version/decorations/${kind}/image`,
    load: (signal?: AbortSignal) => documentsApi.decorationImage('version', kind, signal),
  })),
]

beforeEach(() => {
  vi.stubEnv('VITE_AUTH_MODE', 'api')
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
})
afterEach(() => { http.defaults.adapter = adapter; vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe.each(images)('$name binary image request', ({ path, load }) => {
  it('preserves the Blob and every byte through Axios transforms and interceptors', async () => {
    const original = new Blob([png], { type: 'image/png' })
    http.defaults.adapter = async (config) => {
      expect(config.url).toBe(`https://api.example.test${path}`)
      expect(config.responseType).toBe('blob')
      expect(config.headers.get('Accept')).toBe('application/json')
      expect(config.withCredentials).toBe(true)
      return { config, status: 200, statusText: 'OK', headers: new AxiosHeaders({ 'Content-Type': 'image/png' }), data: original }
    }
    const result = await load()
    expect(result).toBe(original)
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(png)
  })

  it.each(['', 'application/octet-stream', 'image/jpeg', 'image/png; charset=binary'])(
    'uses PNG bytes to correct the declared MIME %s without rewriting bytes', async (type) => {
      http.defaults.adapter = async (config) => ({ config, status: 200, statusText: 'OK', headers: new AxiosHeaders({ 'Content-Type': type }), data: new Blob([png], { type }) })
      const result = await load()
      expect(result.type).toBe('image/png')
      expect(new Uint8Array(await result.arrayBuffer())).toEqual(png)
    },
  )

  it('accepts ArrayBuffer data without string conversion', async () => {
    http.defaults.adapter = async (config) => ({ config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: png.buffer })
    const result = await load()
    expect(result).toBeInstanceOf(Blob)
    expect(result.type).toBe('image/png')
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(png)
  })

  it.each([
    new Blob(['{"data":{"url":"/image.png"}}'], { type: 'application/json' }),
    new Blob(['<!doctype html><html>Sign in</html>'], { type: 'image/png' }),
    new Blob([], { type: 'image/png' }),
    '\u0089PNG\r\n\u001a\n\ufffd',
    { data: 'image' },
  ])('rejects non-image HTTP 200 payloads and preserves the response for diagnosis', async (data) => {
    http.defaults.adapter = async (config) => ({ config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data })
    const cause = await load().catch((error: unknown) => error)
    expect(cause).toBeInstanceOf(AxiosError)
    expect(cause).toMatchObject({ code: AxiosError.ERR_BAD_RESPONSE, response: { status: 200, data } })
  })

  it('propagates the original HTTP error without a replacement image or retry', async () => {
    const error = new AxiosError('Forbidden', AxiosError.ERR_BAD_RESPONSE)
    http.defaults.adapter = vi.fn(async () => { throw error })
    await expect(load()).rejects.toBe(error)
    expect(http.defaults.adapter).toHaveBeenCalledTimes(1)
  })
})

it.each([
  ['image/jpeg', [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]],
  ['image/webp', [0x52, 0x49, 0x46, 0x46, 0x10, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
] as const)('recognizes %s without UTF-8 encoding arbitrary bytes', async (type, bytes) => {
  const data = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' })
  http.defaults.adapter = async (config) => ({ config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data })
  const result = await accountApi.photo()
  expect(result.type).toBe(type)
  expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array(bytes))
})

it.each(images.filter((image) => image.name !== 'profile'))('passes cancellation through the $name image request', async ({ load }) => {
  const controller = new AbortController()
  http.defaults.adapter = async (config) => {
    expect(config.signal).toBe(controller.signal)
    controller.abort()
    return { config, status: 200, statusText: 'OK', headers: new AxiosHeaders(), data: new Blob([png], { type: 'image/png' }) }
  }
  await expect(load(controller.signal)).rejects.toMatchObject({ code: 'ERR_CANCELED' })
})

it.each(images)('reads real HTTP image bytes into a usable Object URL for $name', async ({ load, path }) => {
  const server = createServer((request, response) => {
    expect(request.url).toBe(path)
    response.writeHead(200, { 'Content-Type': 'application/octet-stream' })
    response.end(png)
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test server port')
  vi.stubEnv('VITE_API_BASE_URL', `http://127.0.0.1:${address.port}`)
  http.defaults.adapter = 'fetch'
  let url = ''
  try {
    const blob = await load()
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    url = URL.createObjectURL(blob)
    const response = await fetch(url)
    expect(response.headers.get('Content-Type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png)
    URL.revokeObjectURL(url)
    await expect(fetch(url)).rejects.toThrow()
  } finally {
    if (url) URL.revokeObjectURL(url)
    await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()) })
  }
})

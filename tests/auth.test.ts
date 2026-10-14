import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AxiosError,
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { validateAuth } from '../src/utils/validation'
import { authError } from '../src/services/auth.errors'
import { authApi } from '../src/services/auth.service'
import { http, apiOrigin } from '../src/services/http'
import { prototypeMessages } from '../src/services/auth.mock'
const valid = {
  name: '  Siti Nur  ',
  email: '  siti@example.com  ',
  password: '        ',
  password_confirmation: '        ',
  remember: false,
}
const user = {
  guid: '42ea55cd-df73-4a0f-815f-ecf138510780',
  name: 'Siti',
  email: 'siti@example.com',
  email_verified: false,
}
const originalAdapter = http.defaults.adapter
function response(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown,
): AxiosResponse {
  return { config, status, data, statusText: String(status), headers: new AxiosHeaders() }
}
function apiFailure(status: number, data: unknown = {}) {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    status,
    data,
  } as AxiosResponse)
}
afterEach(() => {
  http.defaults.adapter = originalAdapter
  vi.unstubAllEnvs()
})
describe('Validasi sesuai kontrak', () => {
  it('menerima nama bebas dan password tanpa aturan kompleksitas atau trim', () => {
    expect(validateAuth('register', valid)).toEqual({})
    expect(valid.password).toBe('        ')
  })
  it('memeriksa field kosong dan format email', () => {
    expect(
      Object.keys(
        validateAuth('register', {
          name: ' ',
          email: '',
          password: '',
          password_confirmation: '',
          remember: false,
        }),
      ),
    ).toEqual(['name', 'email', 'password', 'password_confirmation'])
    expect(validateAuth('login', { ...valid, email: 'bukan-email' })).toHaveProperty('email')
  })
  it('menolak password pendek dan menempatkan mismatch pada konfirmasi', () => {
    expect(
      validateAuth('register', { ...valid, password: 'abc', password_confirmation: 'abcd' }),
    ).toHaveProperty('password')
    expect(validateAuth('register', { ...valid, password_confirmation: 'berbeda' })).toHaveProperty(
      'password_confirmation',
    )
    expect(validateAuth('login', { ...valid, password: 'a' })).toEqual({})
  })
  it('membatasi nama dan email 255 karakter', () => {
    expect(validateAuth('register', { ...valid, name: 'a'.repeat(256) })).toHaveProperty('name')
    expect(
      validateAuth('register', { ...valid, email: `${'a'.repeat(250)}@example.com` }),
    ).toHaveProperty('email')
  })
  it('prototype tidak mengklaim sesi, akun, atau pengiriman email nyata', () => {
    expect(prototypeMessages.login).toContain('setelah API')
    expect(prototypeMessages.register).toContain('Belum ada akun')
  })
})
describe('Error backend', () => {
  it('menampilkan 422 login generik tanpa meneruskan informasi akun', () => {
    const result = authError(
      apiFailure(422, {
        error: { code: 'VALIDATION_FAILED', errors: { email: ['Pesan server privat'] } },
      }),
      'login',
    )
    expect(result.message).toContain('Email atau kata sandi salah')
    expect(result.fields).toEqual({})
  })
  it('membaca nested error.errors dan mempertahankan error password server', () => {
    expect(
      authError(
        apiFailure(422, {
          error: {
            errors: { email: ['Email telah digunakan.'], password: ['Password tidak valid.'] },
          },
        }),
        'register',
      ).fields,
    ).toEqual({ email: 'Email telah digunakan.', password: 'Password tidak valid.' })
  })
  it('429 tanpa countdown, 401 membersihkan sesi, 403 tidak selalu verifikasi', () => {
    expect(authError(apiFailure(429), 'login').message).toBe(
      'Terlalu banyak percobaan. Silakan coba lagi nanti.',
    )
    expect(authError(apiFailure(401), 'login').expired).toBe(true)
    expect(authError(apiFailure(403), 'login').message).toContain('Akses ditolak')
    expect(
      authError(apiFailure(403, { error: { code: 'EMAIL_NOT_VERIFIED' } }), 'login').message,
    ).toContain('diverifikasi')
  })
  it('tidak membocorkan pesan internal atau mengklaim email dikirim saat gagal', () => {
    expect(
      authError(apiFailure(500, { error: { message: 'Stack trace rahasia' } }), 'login').message,
    ).not.toContain('rahasia')
    expect(authError(new Error('rahasia'), 'login').message).toContain('coba lagi')
  })
})
describe('Adapter Sanctum dengan respons terkendali', () => {
  it('logout mengirim POST dengan CSRF dan menerima 204 tanpa resource JSON', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    const requests: InternalAxiosRequestConfig[] = []
    http.defaults.adapter = async (config) => {
      requests.push(config)
      return response(config, 204, '')
    }
    expect(await authApi.logout()).toBeUndefined()
    expect(requests.map((config) => [config.method, config.url])).toEqual([
      ['get', 'http://localhost:8000/sanctum/csrf-cookie'],
      ['post', 'http://localhost:8000/api/v1/auth/logout'],
    ])
  })
  it('logout gagal tetap dilaporkan sebagai kegagalan', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    http.defaults.adapter = async (config) => {
      if (config.method === 'post') throw apiFailure(500)
      return response(config, 204, '')
    }
    await expect(authApi.logout()).rejects.toHaveProperty('response.status', 500)
  })
  it('memuat CSRF 204, mengirim remember, lalu memastikan identitas lewat /me', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    const requests: InternalAxiosRequestConfig[] = []
    http.defaults.adapter = async (config) => {
      requests.push(config)
      return response(
        config,
        config.url?.endsWith('csrf-cookie') ? 204 : 200,
        config.url?.endsWith('csrf-cookie') ? '' : { data: user },
      )
    }
    expect(
      await authApi.login({ email: user.email, password: '        ', remember: true }),
    ).toEqual(user)
    expect(requests.map((item) => item.url)).toEqual([
      'http://localhost:8000/sanctum/csrf-cookie',
      'http://localhost:8000/api/v1/auth/login',
      'http://localhost:8000/api/v1/me',
    ])
    expect(JSON.parse(requests[1]!.data)).toEqual({
      email: user.email,
      password: '        ',
      remember: true,
    })
    expect(requests.every((item) => item.withCredentials && item.withXSRFToken)).toBe(true)
  })
  it('201 register mempertahankan akun belum terverifikasi', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    http.defaults.adapter = async (config) =>
      response(
        config,
        config.url?.endsWith('csrf-cookie') ? 204 : config.method === 'post' ? 201 : 200,
        config.url?.endsWith('csrf-cookie') ? '' : { data: user },
      )
    expect((await authApi.register({ ...valid })).email_verified).toBe(false)
  })
  it('memulihkan CSRF tepat sekali dan tidak berulang jika 419 tetap terjadi', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    let mutations = 0
    let cookies = 0
    http.defaults.adapter = async (config) => {
      if (config.method === 'get') {
        cookies++
        return response(config, 204, '')
      }
      mutations++
      throw apiFailure(419)
    }
    await expect(authApi.forgot(user.email)).rejects.toHaveProperty('response.status', 419)
    expect(mutations).toBe(2)
    expect(cookies).toBe(2)
  })
  it('request 429 tidak diulang dan forgot 202 tidak dipakai sebagai bukti email diterima', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    let posts = 0
    http.defaults.adapter = async (config) => {
      if (config.method === 'post') {
        posts++
        throw apiFailure(429)
      }
      return response(config, 204, '')
    }
    await expect(authApi.forgot(user.email)).rejects.toHaveProperty('response.status', 429)
    expect(posts).toBe(1)
    http.defaults.adapter = async (config) =>
      response(
        config,
        config.method === 'get' ? 204 : 202,
        config.method === 'get' ? '' : { data: { status: 'accepted', otp_expires_in: 300, resend_after: 60 } },
      )
    expect(await authApi.forgot(user.email)).toEqual({ status: 'accepted', otp_expires_in: 300, resend_after: 60 })
  })
  it('tidak menerima respons identitas tanpa boolean email_verified', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    http.defaults.adapter = async (config) =>
      response(config, 200, { data: { ...user, email_verified: undefined } })
    await expect(authApi.me()).rejects.toThrow('identitas')
  })
  it('menolak base URL berisi path API atau kredensial', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/api/v1')
    expect(() => apiOrigin()).toThrow()
    vi.stubEnv('VITE_API_BASE_URL', 'https://user:secret@api.example.com')
    expect(() => apiOrigin()).toThrow()
  })
})

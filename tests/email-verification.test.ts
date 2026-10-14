import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError, type AxiosResponse } from 'axios'
import { createEmailVerification } from '../src/composables/useEmailVerification'
import { authApi } from '../src/services/auth.service'
import { http } from '../src/services/http'
import { useAuthStore } from '../src/stores/auth'
import { afterAuthentication, internalDestination } from '../src/utils/authRedirect'

vi.mock('../src/services/http', async (original) => ({
  ...(await original<typeof import('../src/services/http')>()),
  authMode: 'api',
}))
const user = { guid: 'account-a', name: 'Siti', email: 'siti@example.com', email_verified: false }
const originalAdapter = http.defaults.adapter
function failure(status: number, headers = {}) {
  return new AxiosError('private error', undefined, undefined, undefined, {
    status,
    headers,
  } as AxiosResponse)
}
function setup() {
  let time = 100000
  const storage = new Map<string, string>()
  const auth = reactive({
    user: { ...user } as typeof user | null,
    sessionError: '',
    refresh: vi.fn(async () => {}),
  })
  const resend = vi.fn(async () => {})
  const onExpired = vi.fn()
  const options = {
    now: () => time,
    resend,
    onExpired,
    storage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    },
  }
  const model = createEmailVerification(auth, options)
  return {
    auth,
    model,
    options,
    storage,
    resend,
    onExpired,
    advance: (ms: number) => {
      time += ms
      model.tick()
    },
  }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  http.defaults.adapter = originalAdapter
})

describe('Redirect autentikasi', () => {
  it('mengirim akun belum terverifikasi ke permintaan, akun terverifikasi ke tujuan internal', () => {
    expect(afterAuthentication(false, '/')).toBe('/email/verify')
    expect(afterAuthentication(true, '/email/verified')).toBe('/email/verified')
    for (const value of [
      '//evil.test',
      'https://evil.test',
      '/\\evil.test',
      '/login',
      ['/email/verify'],
    ]) {
      expect(internalDestination(value)).toBe('/')
    }
    expect(internalDestination('/?tab=docs#main')).toBe('/?tab=docs#main')
  })
})
describe('Cooldown dan status verifikasi', () => {
  it('tidak resend otomatis; menolak klik ganda dan mempertahankan cooldown setelah remount', async () => {
    const { model, resend, options, auth, advance } = setup()
    expect(resend).not.toHaveBeenCalled()
    let finish!: () => void
    resend.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const request = model.resend()
    await model.resend()
    expect(resend).toHaveBeenCalledTimes(1)
    finish()
    await request
    expect(model.message.value).toContain('Permintaan kirim ulang diterima')
    expect(auth.user?.email_verified).toBe(false)
    expect(model.remaining.value).toBe(60)
    advance(11000)
    const remounted = createEmailVerification(auth, options)
    expect(remounted.remaining.value).toBe(49)
    await model.resend()
    expect(resend).toHaveBeenCalledTimes(1)
    advance(49000)
    expect(model.remaining.value).toBe(0)
    model.dispose()
    remounted.dispose()
  })
  it.each([
    ['120', 120],
    ['Thu, 01 Jan 1970 00:03:20 GMT', 100],
    [undefined, 60],
  ])('429 mengikuti Retry-After %s', async (header, seconds) => {
    const { model, resend } = setup()
    resend.mockRejectedValue(failure(429, { 'retry-after': header }))
    await model.resend()
    expect(model.remaining.value).toBe(seconds)
    expect(model.message.value).toContain(`${seconds} detik`)
    expect(resend).toHaveBeenCalledTimes(1)
    model.dispose()
  })
  it.each([419, 500, 0])(
    'error %s tidak menampilkan sukses atau retry otomatis',
    async (status) => {
      const { model, resend } = setup()
      resend.mockRejectedValue(status ? failure(status) : new Error('network'))
      await model.resend()
      expect(model.failed.value).toBe(true)
      expect(model.remaining.value).toBe(0)
      expect(model.message.value).not.toContain('diterima')
      expect(resend).toHaveBeenCalledTimes(1)
      model.dispose()
    },
  )
  it('401 membersihkan sesi dan mengembalikan pengguna ke login', async () => {
    const { model, resend, auth, onExpired } = setup()
    resend.mockRejectedValue(failure(401))
    await model.resend()
    expect(auth.user).toBeNull()
    expect(onExpired).toHaveBeenCalledTimes(1)
    model.dispose()
  })
  it('cooldown dipisahkan per guid dan dibuang saat akun terverifikasi', async () => {
    const { model, auth, storage } = setup()
    await model.resend()
    auth.user = { ...user, guid: 'account-b' }
    await nextTick()
    expect(model.remaining.value).toBe(0)
    auth.user = { ...user }
    await nextTick()
    expect(model.remaining.value).toBe(60)
    auth.user.email_verified = true
    await nextTick()
    expect(model.remaining.value).toBe(0)
    expect(storage.size).toBe(0)
    model.dispose()
  })
  it('pemeriksaan manual menyampaikan status, pemeriksaan fokus dibatasi dan tidak ganda', async () => {
    const { model, auth, advance } = setup()
    let finish!: () => void
    auth.refresh.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const request = model.check()
    await model.check(true)
    finish()
    await request
    expect(model.message.value).toContain('belum terverifikasi')
    await model.check(true)
    expect(auth.refresh).toHaveBeenCalledTimes(1)
    advance(5000)
    auth.refresh.mockImplementation(async () => {
      auth.user!.email_verified = true
    })
    await model.check(true)
    expect(auth.user?.email_verified).toBe(true)
    expect(auth.refresh).toHaveBeenCalledTimes(2)
    model.dispose()
  })
})
describe('Sinkronisasi identitas dan adapter', () => {
  it('berbagi /me saat restore dan halaman memeriksa bersama; non-401 tidak menghapus sesi', async () => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    let finish!: (value: typeof user) => void
    const me = vi.spyOn(authApi, 'me').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const initial = auth.restore()
    const page = auth.refresh()
    expect(me).toHaveBeenCalledTimes(1)
    expect(auth.restoring).toBe(true)
    finish({ ...user })
    await Promise.all([initial, page])
    me.mockRejectedValue(failure(500))
    await auth.refresh()
    expect(auth.user).toEqual(user)
    expect(auth.sessionError).toContain('belum dapat diperiksa')
    me.mockRejectedValue(failure(401))
    await auth.refresh()
    expect(auth.user).toBeNull()
    expect(auth.sessionError).toBe('')
  })
  it('user dari login/registrasi dipakai tanpa /me tambahan', async () => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    const me = vi.spyOn(authApi, 'me')
    auth.setUser({ ...user })
    await auth.restore()
    expect(me).not.toHaveBeenCalled()
  })
  it('respons /me lama tidak mengembalikan sesi setelah logout', async () => {
    setActivePinia(createPinia())
    const auth = useAuthStore()
    auth.setUser({ ...user })
    let finish!: (value: typeof user) => void
    vi.spyOn(authApi, 'me').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    vi.spyOn(authApi, 'logout').mockResolvedValue(undefined)
    const pending = auth.refresh()
    await auth.logout()
    finish({ ...user })
    await pending
    expect(auth.user).toBeNull()
  })
  it('resend tanpa email pada body, dengan CSRF dan satu retry 419', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    const calls: string[] = []
    let posts = 0
    http.defaults.adapter = async (config) => {
      calls.push(`${config.method} ${config.url}`)
      if (config.method === 'post') {
        expect(JSON.parse(config.data)).toEqual({})
        if (++posts === 1) throw failure(419)
      }
      return {
        config,
        status: config.method === 'post' ? 202 : 204,
        statusText: '',
        headers: {},
        data: { data: { status: 'sent' } },
      }
    }
    expect(await authApi.resendVerification()).toEqual({ status: 'sent' })
    expect(calls).toEqual([
      'get http://localhost:8000/sanctum/csrf-cookie',
      'post http://localhost:8000/api/v1/auth/email/resend',
      'get http://localhost:8000/sanctum/csrf-cookie',
      'post http://localhost:8000/api/v1/auth/email/resend',
    ])
  })
})

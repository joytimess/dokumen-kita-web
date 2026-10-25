import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { AxiosError } from 'axios'
import { useAuthStore } from '../src/stores/auth'
import { authApi } from '../src/services/auth.service'
import { http } from '../src/services/http'
import { clearInvitation, pendingInvitation, rememberInvitation } from '../src/utils/invitation'
import { afterAuthentication } from '../src/utils/authRedirect'
import router from '../src/router'

vi.mock('vue-router', async (original) => {
  const actual = await original<typeof import('vue-router')>()
  return { ...actual, createWebHistory: actual.createMemoryHistory }
})
vi.mock('../src/services/http', async (original) => ({
  ...(await original<typeof import('../src/services/http')>()),
  authMode: 'api',
}))
vi.mock('../src/views/LandingView.vue', () => ({ default: {} }))
vi.mock('../src/views/auth/LoginView.vue', () => ({ default: {} }))
vi.mock('../src/views/auth/RegisterView.vue', () => ({ default: {} }))
vi.mock('../src/views/auth/EmailVerificationView.vue', () => ({ default: {} }))
vi.mock('../src/views/auth/ForgotPasswordView.vue', () => ({ default: {} }))
vi.mock('../src/layouts/WorkspaceLayout.vue', () => ({ default: {} }))
vi.mock('../src/views/workspace/DocumentsView.vue', () => ({ default: {} }))
vi.mock('../src/views/workspace/InvitationClaimView.vue', () => ({ default: {} }))
vi.mock('../src/views/NotFoundView.vue', () => ({ default: {} }))
const user = { guid: 'owner', name: 'Owner', email: 'owner@example.test', email_verified: true }
const originalAdapter = http.defaults.adapter
afterEach(() => {
  http.defaults.adapter = originalAdapter
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  setActivePinia(createPinia())
  clearInvitation()
  vi.restoreAllMocks()
  vi.stubGlobal('document', { title: '', documentElement: { lang: '' } })
})
describe('Routing workspace dan regresi autentikasi', () => {
  it.each(['/login', '/register'])('menyimpan undangan dari email di %s sampai autentikasi selesai', async (path) => {
    vi.spyOn(authApi, 'me').mockRejectedValue(
      new AxiosError('unauthorized', undefined, undefined, undefined, { status: 401 } as never),
    )
    const token = 'b'.repeat(64)
    await router.push(`${path}?invitation_token=${token}`)
    expect(router.currentRoute.value.path).toBe(path)
    expect(router.currentRoute.value.query.redirect).toBe('/invitations/claim')
    expect(router.currentRoute.value.fullPath).not.toContain(token)
    expect(pendingInvitation()).toBe(token)

    useAuthStore().setUser({ ...user, guid: 'recipient', email: 'recipient@example.test' })
    await router.push(afterAuthentication(true, router.currentRoute.value.query.redirect))
    expect(router.currentRoute.value.path).toBe('/invitations/claim')
    expect(pendingInvitation()).toBe(token)
  })
  it('link email tetap menuju undangan saat penerima sudah login', async () => {
    useAuthStore().setUser(user)
    await router.push(`/login?invitation_token=${'c'.repeat(64)}`)
    expect(router.currentRoute.value.path).toBe('/invitations/claim')
    expect(pendingInvitation()).toBe('c'.repeat(64))
  })
  it('token email yang tidak valid tidak memakai undangan sebelumnya', async () => {
    rememberInvitation('d'.repeat(64))
    vi.spyOn(authApi, 'me').mockRejectedValue(
      new AxiosError('unauthorized', undefined, undefined, undefined, { status: 401 } as never),
    )
    await router.push('/login?invitation_token=invalid')
    expect(pendingInvitation()).toBe('')
    expect(router.currentRoute.value.query.invitation_token).toBeUndefined()
    expect(router.currentRoute.value.query.redirect).toBe('/invitations/claim?error=invalid')
  })
  it('landing tetap route publik dan recovery/verifikasi tidak tertimpa shell', () => {
    expect(router.resolve('/').meta.workspace).toBeUndefined()
    for (const path of ['/forgot-password', '/email/verify', '/email/verified'])
      expect(router.resolve(path).meta.workspace).toBeUndefined()
    expect(router.resolve('/documents').meta.workspace).toBe(true)
    expect(router.resolve('/documents/new').meta.title).toBe('Halaman tidak ditemukan')
    const guid = '11111111-1111-4111-8111-111111111111'
    expect(router.resolve(`/documents/${guid}`).meta.workspace).toBe(true)
    expect(router.resolve(`/documents/${guid}/edit`).meta.title).toBe('Penyusunan draft')
    expect(router.resolve(`/documents/${guid}/versions/${guid}/view`).meta.title).toBe('Baca dokumen')
    expect(router.resolve('/invitations/claim').meta.invitation).toBe(true)
  })
  it('landing tetap terbuka dengan sesi valid, login menuju dashboard', async () => {
    useAuthStore().setUser(user)
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/dashboard')
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
  })
  it('landing dapat dibuka tanpa sesi meski pemeriksaan sesi gagal', async () => {
    await router.push('/forgot-password')
    const checkSession = vi.spyOn(authApi, 'me').mockRejectedValue(new Error('offline'))
    await router.push('/')
    expect(router.currentRoute.value.path).toBe('/')
    expect(checkSession).not.toHaveBeenCalled()
  })
  it('sesi valid tidak membelokkan halaman recovery', async () => {
    useAuthStore().setUser(user)
    await router.push('/forgot-password')
    expect(router.currentRoute.value.path).toBe('/forgot-password')
  })
  it('401 restore menuju login dengan tujuan route privat', async () => {
    const { AxiosError } = await import('axios')
    vi.spyOn(authApi, 'me').mockRejectedValue(
      new AxiosError('unauthorized', undefined, undefined, undefined, { status: 401 } as never),
    )
    await router.push('/documents')
    expect(router.currentRoute.value.path).toBe('/login')
    expect(router.currentRoute.value.query.redirect).toBe('/documents')
  })
  it('restore gagal jaringan mempertahankan error tanpa dianggap logout', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new Error('offline'))
    await router.push('/documents')
    expect(router.currentRoute.value.path).toBe('/documents')
    expect(useAuthStore().sessionError).not.toBe('')
  })
  it.each([200, 401])('OAuth return checks the configured /me endpoint and handles HTTP %i without redirect loops', async (status) => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_API_BASE_URL', 'https://api-staging.dokumenkita.online')
    const identity = vi.fn(async (config) => {
      expect(config.url).toBe('https://api-staging.dokumenkita.online/api/v1/me')
      expect(config.withCredentials).toBe(true)
      if (status === 401) throw new AxiosError('unauthorized', undefined, config, undefined, { status, config } as never)
      return { config, status, statusText: 'OK', headers: {}, data: { data: user } }
    })
    http.defaults.adapter = identity
    await router.push('/dashboard?login_summary=oauth-return')
    expect(identity).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.query.login_summary).toBeUndefined()
    if (status === 200) {
      expect(router.currentRoute.value.path).toBe('/dashboard')
      expect(useAuthStore().user).toEqual(user)
    } else {
      expect(router.currentRoute.value.path).toBe('/login')
      expect(router.currentRoute.value.query.redirect).toBe('/dashboard')
      expect(useAuthStore().user).toBeNull()
      await router.push('/dashboard')
      expect(router.currentRoute.value.path).toBe('/login')
      expect(identity).toHaveBeenCalledTimes(1)
    }
  })
  it('rechecks identity on an OAuth return even if the previous guest bootstrap was cached', async () => {
    const me = vi.spyOn(authApi, 'me').mockRejectedValueOnce(
      new AxiosError('unauthorized', undefined, undefined, undefined, { status: 401 } as never),
    ).mockResolvedValue(user)
    await router.push('/login')
    expect(useAuthStore().user).toBeNull()
    await router.push('/dashboard?login_summary=oauth-return')
    expect(me).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(useAuthStore().user).toEqual(user)
  })
  it.each([false, true])('waits for pending identity before navigation when bootstrap was already initialized: %s', async (initialized) => {
    await router.push('/forgot-password')
    const auth = useAuthStore()
    const me = vi.spyOn(authApi, 'me').mockResolvedValue(user)
    if (initialized) await auth.restore()
    let resolveIdentity!: (value: typeof user) => void
    me.mockImplementation(() => new Promise((resolve) => { resolveIdentity = resolve }))
    const pending = auth.refresh()
    const navigation = router.push('/dashboard')
    try {
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(auth.restoring).toBe(true)
      expect(router.currentRoute.value.path).toBe('/forgot-password')
    } finally {
      resolveIdentity(user)
      await Promise.all([pending, navigation])
    }
    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(auth.user).toEqual(user)
    expect(me).toHaveBeenCalledTimes(initialized ? 2 : 1)
  })
  it('keeps OAuth return identity unknown on a network error instead of bouncing to login', async () => {
    vi.spyOn(authApi, 'me').mockRejectedValue(new AxiosError('network unavailable', 'ERR_NETWORK'))
    await router.push('/dashboard?login_summary=oauth-return')
    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(useAuthStore().user).toBeNull()
    expect(useAuthStore().sessionError).not.toBe('')
  })
  it('preserves the known user when an OAuth identity check fails over the network', async () => {
    useAuthStore().setUser(user)
    vi.spyOn(authApi, 'me').mockRejectedValue(new AxiosError('network unavailable', 'ERR_NETWORK'))
    await router.push('/dashboard?login_summary=oauth-return')
    expect(router.currentRoute.value.path).toBe('/dashboard')
    expect(useAuthStore().user).toEqual(user)
    expect(useAuthStore().sessionError).not.toBe('')
  })
  it('menghapus token dari URL, mempertahankan undangan melewati verifikasi', async () => {
    useAuthStore().setUser({ ...user, email_verified: false })
    await router.push(`/invitations/claim?token=${'a'.repeat(64)}`)
    expect(pendingInvitation()).toBe('a'.repeat(64))
    expect(router.currentRoute.value.path).toBe('/email/verify')
    expect(router.currentRoute.value.fullPath).not.toContain('a'.repeat(64))
    useAuthStore().setUser(user)
    await router.push('/login')
    expect(router.currentRoute.value.path).toBe('/invitations/claim')
  })
})

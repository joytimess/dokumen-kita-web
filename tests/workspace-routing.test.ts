import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '../src/stores/auth'
import { authApi } from '../src/services/auth.service'
import { clearInvitation, pendingInvitation } from '../src/utils/invitation'
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
beforeEach(() => {
  setActivePinia(createPinia())
  clearInvitation()
  vi.restoreAllMocks()
  vi.stubGlobal('document', { title: '' })
})
describe('Routing workspace dan regresi autentikasi', () => {
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

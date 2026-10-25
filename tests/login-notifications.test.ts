// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'
import { AxiosError } from 'axios'
import AuthForm from '../src/components/auth/AuthForm.vue'
import WorkspaceHeader from '../src/components/workspace/WorkspaceHeader.vue'
import InteractionHost from '../src/components/ui/InteractionHost.vue'
import { authApi } from '../src/services/auth.service'
import { notice, notify } from '../src/services/feedback'
import { useAuthStore } from '../src/stores/auth'
import { useNotificationsStore } from '../src/stores/notifications'
import router from '../src/router'
import type { NotificationPage, UserNotification } from '../src/types/notifications'

const api = vi.hoisted(() => ({ list: vi.fn(), markRead: vi.fn() }))
vi.mock('../src/services/notifications.service', () => ({ notificationsApi: api }))
vi.mock('../src/services/http', async (original) => ({ ...await original<typeof import('../src/services/http')>(), authMode: 'api' }))
vi.mock('vue-router', async (original) => {
  const actual = await original<typeof import('vue-router')>()
  return { ...actual, createWebHistory: actual.createMemoryHistory }
})
vi.mock('../src/views/auth/LoginView.vue', () => ({ default: {} }))
vi.mock('../src/views/auth/EmailVerificationView.vue', () => ({ default: {} }))
vi.mock('../src/layouts/WorkspaceLayout.vue', () => ({ default: {} }))
vi.mock('../src/views/workspace/DocumentsView.vue', () => ({ default: {} }))
vi.mock('../src/views/workspace/ProfileView.vue', () => ({ default: {} }))

const user = { guid: 'user-a', name: 'Budi', email: 'budi@example.test', email_verified: true }
const item: UserNotification = {
  guid: 'notice-1', event_type: 'assignment.signed', title: 'Signed', message: 'Document signed',
  document_guid: null, version_guid: null, assignment_guid: null,
  created_at: '2026-10-23T00:00:00Z', read_at: null,
}
function page(unreadCount: number): NotificationPage {
  return { data: [item], links: { next: null }, meta: { current_page: 1, last_page: 1, per_page: 20, total: 100, unread_count: unreadCount } }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}
let app: App | undefined
let pinia: Pinia
let host: HTMLDivElement
async function settle() {
  for (let i = 0; i < 40; i++) { await Promise.resolve(); await nextTick() }
}
function mountRoot() {
  host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h('div', [
    router.currentRoute.value.meta.workspace ? h(WorkspaceHeader) : h(AuthForm, { kind: 'login' }),
    h(InteractionHost),
  ]) })
  app.provide('workspaceBeforeLogout', ref(null))
  app.use(pinia).use(router).mount(host)
}
function restartPage() {
  app?.unmount(); app = undefined
  host?.remove()
  disposePinia(pinia)
  pinia = createPinia(); setActivePinia(pinia)
}
function fill(selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector)!
  input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function login() {
  fill('#email', user.email); fill('#password', 'Password123!')
  host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
}
function bell() { return host.querySelector<HTMLButtonElement>('[aria-controls=workspace-notifications]')! }

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
  sessionStorage.clear(); notify.dismiss()
  pinia = createPinia(); setActivePinia(pinia)
  vi.spyOn(authApi, 'me').mockRejectedValue(new AxiosError('unauthorized', undefined, undefined, undefined, { status: 401 } as never))
  vi.spyOn(authApi, 'login').mockResolvedValue(user)
  vi.spyOn(authApi, 'logout').mockResolvedValue(undefined)
  api.list.mockResolvedValue(page(1))
  await router.replace('/login')
  mountRoot(); await settle()
})
afterEach(() => {
  app?.unmount(); app = undefined
  host?.remove(); disposePinia(pinia)
  notify.dismiss(); sessionStorage.clear()
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs()
})

it('logs in with zero unread notifications without a success or session toast', async () => {
  api.list.mockResolvedValue(page(0))
  await login()
  expect(router.currentRoute.value.path).toBe('/dashboard')
  expect(useAuthStore().user?.guid).toBe(user.guid)
  expect(useNotificationsStore().unreadCount).toBe(0)
  expect(notice.value).toBeNull()
  expect(bell().getAttribute('aria-label')).toBe('Notifikasi')
  expect(api.list).toHaveBeenCalledTimes(1)
})

it.each([1, 42])('shows one summary for %i unread notifications using the same count as the navbar badge', async (count) => {
  api.list.mockResolvedValue(page(count))
  await login()
  expect(notice.value).toMatchObject({ message: `Anda memiliki ${count} notifikasi`, description: 'Lihat pembaruan dokumen dan tanda tangan Anda.', icon: 'notifications', kind: 'info' })
  expect(host.textContent).not.toContain('Sesi aktif sebagai')
  expect(bell().getAttribute('aria-label')).toBe(`${count} notifikasi belum dibaca`)
  const id = notice.value!.id
  await router.push('/profile'); await router.push('/dashboard?again=1'); await settle()
  expect(notice.value?.id).toBe(id)
  expect(api.list).toHaveBeenCalledTimes(1)
})

it('dismisses the summary without marking anything read or showing it again on navigation', async () => {
  await login()
  host.querySelector<HTMLButtonElement>('[aria-label="Tutup notifikasi"]')!.click(); await settle()
  expect(notice.value).toBeNull()
  expect(useNotificationsStore().unreadCount).toBe(1)
  expect(api.markRead).not.toHaveBeenCalled()
  await router.push('/profile'); await router.push('/dashboard'); await settle()
  expect(notice.value).toBeNull()
})

it('preserves the requested destination and presents the summary after the successful redirect', async () => {
  await router.replace('/login?redirect=%2Fprofile%3Fsection%3Didentity'); await settle()
  await login()
  expect(router.currentRoute.value.fullPath).toBe('/profile?section=identity')
  expect(notice.value?.message).toBe('Anda memiliki 1 notifikasi')
  expect(api.list).toHaveBeenCalledTimes(1)
})

it('can open the notification center when login first redirects to email verification', async () => {
  vi.mocked(authApi.login).mockResolvedValue({ ...user, email_verified: false })
  await login()
  expect(router.currentRoute.value.path).toBe('/email/verify')
  expect(notice.value?.message).toBe('Anda memiliki 1 notifikasi')
  host.querySelector<HTMLButtonElement>('[role=status] button:not([aria-label])')!.click(); await settle()
  expect(router.currentRoute.value.path).toBe('/dashboard')
  expect(bell().getAttribute('aria-expanded')).toBe('true')
  expect(api.markRead).not.toHaveBeenCalled()
})

it('opens the existing notification center from the toast and updates the shared badge only when an item is read', async () => {
  await login()
  host.querySelector<HTMLButtonElement>('[role=status] button:not([aria-label])')!.click(); await settle()
  expect(notice.value).toBeNull()
  expect(bell().getAttribute('aria-expanded')).toBe('true')
  expect(api.list).toHaveBeenCalledTimes(1)
  expect(api.markRead).not.toHaveBeenCalled()
  api.markRead.mockResolvedValue({ data: { ...item, read_at: '2026-10-23T01:00:00Z' }, meta: { unread_count: 0 } })
  host.querySelector<HTMLButtonElement>('#workspace-notifications [aria-label^="Buka notifikasi"]')!.click(); await settle()
  expect(api.markRead).toHaveBeenCalledWith(item.guid)
  expect(useNotificationsStore().unreadCount).toBe(0)
  expect(bell().getAttribute('aria-label')).toBe('Notifikasi')
})

it('deduplicates the header and summary requests and waits for a real count', async () => {
  const request = deferred<NotificationPage>()
  api.list.mockReturnValueOnce(request.promise)
  await login()
  const notifications = useNotificationsStore()
  void notifications.ensureLoaded()
  notifications.queueLoginSummary()
  void notifications.showLoginSummary(vi.fn())
  expect(api.list).toHaveBeenCalledTimes(1)
  expect(notifications.unreadCount).toBeUndefined()
  expect(notice.value).toBeNull()
  request.resolve(page(9)); await settle()
  const id = notice.value?.id
  expect(notice.value?.message).toBe('Anda memiliki 9 notifikasi')
  notifications.queueLoginSummary()
  await notifications.showLoginSummary(vi.fn())
  expect(notice.value?.id).toBe(id)
})

it('keeps login successful when the notification request fails and never replays the summary after a retry', async () => {
  api.list.mockRejectedValueOnce(new AxiosError('count unavailable', undefined, undefined, undefined, { status: 401 } as never))
  await login()
  expect(useAuthStore().user?.guid).toBe(user.guid)
  expect(router.currentRoute.value.path).toBe('/dashboard')
  expect(useNotificationsStore().unreadCount).toBeUndefined()
  expect(notice.value).toBeNull()
  bell().click(); await settle()
  expect(useNotificationsStore().unreadCount).toBe(1)
  expect(notice.value).toBeNull()
})

it('restores a previous session after a page refresh without a login summary', async () => {
  await login()
  restartPage()
  vi.mocked(authApi.me).mockResolvedValue(user)
  await router.replace('/dashboard?reload=1')
  mountRoot(); await settle()
  expect(useAuthStore().user?.guid).toBe(user.guid)
  expect(useNotificationsStore().unreadCount).toBe(1)
  expect(notice.value).toBeNull()
})

it('locks the Google button immediately against double-click and restores it on browser back', async () => {
  const pending = deferred<void>()
  const google = vi.spyOn(authApi, 'google').mockReturnValue(pending.promise)
  const button = host.querySelector<HTMLButtonElement>('.auth-google-button')!
  button.click(); button.click(); await settle()
  expect(google).toHaveBeenCalledTimes(1)
  expect(button.disabled).toBe(true)
  expect(host.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true)
  pending.resolve(); await settle()
  expect(button.disabled).toBe(true)
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }))
  await settle()
  expect(button.disabled).toBe(false)
})

it('handles the real Google redirect entry once, strips its marker and never treats a replay as a new login', async () => {
  await router.replace('/login?redirect=%2Fprofile%3Fsection%3Didentity%23photo'); await settle()
  const navigation = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  host.querySelector<HTMLButtonElement>('.auth-google-button')!.click()
  const target = new URL(navigation.mock.calls[0]![0]).searchParams.get('redirect')!
  expect(target).toContain('login_summary=')
  restartPage()
  vi.mocked(authApi.me).mockResolvedValue(user)
  await router.replace(target)
  mountRoot(); await settle()
  expect(router.currentRoute.value.path).toBe('/profile')
  expect(router.currentRoute.value.query.section).toBe('identity')
  expect(router.currentRoute.value.hash).toBe('#photo')
  expect(router.currentRoute.value.query.login_summary).toBeUndefined()
  expect(notice.value?.message).toBe('Anda memiliki 1 notifikasi')
  expect(api.list).toHaveBeenCalledTimes(1)
  restartPage()
  await router.replace(target)
  mountRoot(); await settle()
  expect(notice.value).toBeNull()
})

it('does not treat a cancelled Google login or an unmatched return marker as a successful login', async () => {
  const navigation = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  host.querySelector<HTMLButtonElement>('.auth-google-button')!.click()
  const target = new URL(navigation.mock.calls[0]![0]).searchParams.get('redirect')!
  await router.replace('/login?error=oauth_denied'); await settle()
  notify.dismiss()
  restartPage()
  vi.mocked(authApi.me).mockResolvedValue(user)
  await router.replace(target)
  mountRoot(); await settle()
  expect(notice.value).toBeNull()
})

it('keeps Google login available if browser storage cannot persist a summary marker', () => {
  vi.spyOn(sessionStorage, 'setItem').mockImplementation(() => { throw new Error('storage unavailable') })
  const navigation = vi.spyOn(window.location, 'assign').mockImplementation(() => {})
  host.querySelector<HTMLButtonElement>('.auth-google-button')!.click()
  expect(new URL(navigation.mock.calls[0]![0]).searchParams.get('redirect')).toBe('/dashboard')
  expect(notice.value).toBeNull()
})

it('clears the old count and ignores its pending response after logout and login as another account', async () => {
  const request = deferred<NotificationPage>()
  api.list.mockReturnValueOnce(request.promise)
  await login()
  await useAuthStore().logout()
  expect(useNotificationsStore().unreadCount).toBeUndefined()
  expect(useNotificationsStore().notifications).toEqual([])
  await router.replace('/login'); await settle()
  const other = { ...user, guid: 'user-b', name: 'Sari', email: 'sari@example.test' }
  vi.mocked(authApi.login).mockResolvedValue(other)
  api.list.mockResolvedValueOnce(page(2))
  await login()
  expect(notice.value?.message).toBe('Anda memiliki 2 notifikasi')
  request.resolve(page(99)); await settle()
  expect(useNotificationsStore().unreadCount).toBe(2)
  expect(notice.value?.message).toBe('Anda memiliki 2 notifikasi')
  await useAuthStore().logout(); await settle()
  expect(notice.value).toBeNull()
})

// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import { createPinia, disposePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import WorkspaceHeader from '../src/components/workspace/WorkspaceHeader.vue'
import FeedbackMessage from '../src/components/ui/FeedbackMessage.vue'
import { useAuthStore } from '../src/stores/auth'
import { language } from '../src/services/workspace-language'

const api = vi.hoisted(() => ({ photo: vi.fn(), me: vi.fn(), notifications: vi.fn() }))
vi.mock('../src/services/account.service', () => ({ accountApi: { photo: api.photo } }))
vi.mock('../src/services/auth.service', () => ({ authApi: { me: api.me } }))
vi.mock('../src/services/notifications.service', () => ({ notificationsApi: { list: api.notifications } }))

let app: App | undefined
let host: HTMLDivElement
let pinia: Pinia
const user = { guid: 'user', name: 'Budi', email: 'budi@example.test', email_verified: true, photo_url: '/api/v1/me/photo' }

async function settle() {
  for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() }
}
async function mount(photoUrl: string | null = user.photo_url) {
  language.value = 'id'
  pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.setUser({ ...user, photo_url: photoUrl })
  const router = createRouter({ history: createMemoryHistory(), routes: ['/dashboard', '/profile'].map((path) => ({ path, component: { render: () => null } })) })
  await router.push('/dashboard')
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(WorkspaceHeader)
  app.provide('workspaceBeforeLogout', ref(null))
  app.component('FeedbackMessage', FeedbackMessage)
  app.use(pinia).use(router).mount(host)
  await settle()
  return auth
}
async function toggleProfile() {
  host.querySelector<HTMLButtonElement>('button[aria-controls=workspace-profile]')!.click()
  await settle()
}
function images() { return [...host.querySelectorAll<HTMLImageElement>('img')] }

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:avatar')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  api.photo.mockResolvedValue(new Blob(['photo'], { type: 'image/png' }))
  api.notifications.mockResolvedValue({ data: [], meta: { current_page: 1, last_page: 1, unread_count: 0 } })
})
afterEach(() => {
  app?.unmount(); app = undefined
  if (pinia) disposePinia(pinia)
  host?.remove()
  vi.restoreAllMocks()
})

it('reuses the loaded navbar image immediately across repeated dropdown mounts without profile requests', async () => {
  await mount()
  expect(api.photo).toHaveBeenCalledTimes(1)
  images()[0]!.dispatchEvent(new Event('load')); await settle()
  for (let i = 0; i < 3; i++) {
    await toggleProfile()
    expect(images().map((image) => image.getAttribute('src'))).toEqual(['blob:avatar', 'blob:avatar'])
    expect(images().every((image) => !image.classList.contains('invisible'))).toBe(true)
    expect(host.querySelector('#workspace-profile')?.textContent).not.toMatch(/^B\s/)
    expect(api.photo).toHaveBeenCalledTimes(1)
    await toggleProfile()
  }
  expect(api.me).not.toHaveBeenCalled()
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
})

it('does not reload the photo when unrelated profile fields change', async () => {
  const auth = await mount()
  auth.setUser({ ...auth.user!, name: 'Budi Baru' }); await settle()
  await toggleProfile()
  expect(api.photo).toHaveBeenCalledTimes(1)
  expect(host.querySelector('#workspace-profile')?.textContent).toContain('Budi Baru')
})

it('falls back in both avatars when an external image fails without retrying on dropdown open', async () => {
  await mount('https://example.test/photo.png')
  images()[0]!.dispatchEvent(new Event('error')); await settle()
  await toggleProfile()
  expect(images()).toHaveLength(0)
  expect(host.querySelector('button[aria-controls=workspace-profile]')?.textContent).toContain('B')
  expect(host.querySelector('#workspace-profile .size-12')?.textContent).toBe('B')
  expect(api.photo).not.toHaveBeenCalled()
})

it('shares an in-flight photo request without showing initials while loading', async () => {
  let resolve!: (blob: Blob) => void
  api.photo.mockReturnValueOnce(new Promise<Blob>((done) => { resolve = done }))
  await mount()
  await toggleProfile()
  expect(api.photo).toHaveBeenCalledTimes(1)
  expect(images()).toHaveLength(0)
  expect(host.querySelector('button[aria-controls=workspace-profile]')?.textContent).not.toContain('B')
  expect(host.querySelector('#workspace-profile .size-12')?.textContent).toBe('')
  resolve(new Blob(['photo'])); await settle()
  expect(images()).toHaveLength(2)
  expect(images().every((image) => image.classList.contains('invisible'))).toBe(true)
  images()[0]!.dispatchEvent(new Event('load')); await settle()
  expect(images().every((image) => !image.classList.contains('invisible'))).toBe(true)
})

it('keeps the initials fallback for missing photos and failed photo requests', async () => {
  const auth = await mount(null)
  await toggleProfile()
  expect(images()).toHaveLength(0)
  expect(host.querySelector('#workspace-profile .size-12')?.textContent).toBe('B')
  expect(api.photo).not.toHaveBeenCalled()
  api.photo.mockRejectedValueOnce(new Error('unavailable'))
  auth.setUser(user); await settle()
  expect(images()).toHaveLength(0)
  expect(host.querySelector('#workspace-profile .size-12')?.textContent).toBe('B')
  await toggleProfile(); await toggleProfile()
  expect(api.photo).toHaveBeenCalledTimes(1)
})

it('reacts to changed photo URLs, ignores old image events and removes deleted photos', async () => {
  const auth = await mount('https://example.test/old.png')
  await toggleProfile()
  const oldImage = images()[0]!
  auth.setUser({ ...user, photo_url: 'https://example.test/new.png' }); await settle()
  oldImage.dispatchEvent(new Event('error')); await settle()
  expect(images().map((image) => image.getAttribute('src'))).toEqual(['https://example.test/new.png', 'https://example.test/new.png'])
  expect(images().every((image) => image.classList.contains('invisible'))).toBe(true)
  images()[0]!.dispatchEvent(new Event('load')); await settle()
  expect(images().every((image) => !image.classList.contains('invisible'))).toBe(true)
  auth.setUser({ ...user, photo_url: null }); await settle()
  expect(images()).toHaveLength(0)
  expect(host.querySelector('#workspace-profile .size-12')?.textContent).toBe('B')
  expect(api.photo).not.toHaveBeenCalled()
})

it('refreshes both mounted avatars once when an upload retains the private photo URL', async () => {
  const auth = await mount()
  await toggleProfile()
  vi.mocked(URL.createObjectURL).mockReturnValueOnce('blob:updated-avatar')
  auth.setUser({ ...user })
  await auth.loadPhoto(true); await settle()
  expect(api.photo).toHaveBeenCalledTimes(2)
  expect(images().map((image) => image.getAttribute('src'))).toEqual(['blob:updated-avatar', 'blob:updated-avatar'])
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar')
  await toggleProfile(); await toggleProfile()
  expect(api.photo).toHaveBeenCalledTimes(2)
})

it('drops stale responses after switching accounts and releases cached blobs on session end', async () => {
  let resolve!: (blob: Blob) => void
  api.photo.mockReturnValueOnce(new Promise<Blob>((done) => { resolve = done }))
  const auth = await mount()
  auth.setUser({ ...user, guid: 'other-user' }); await settle()
  expect(api.photo).toHaveBeenCalledTimes(2)
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  resolve(new Blob(['stale'])); await settle()
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  auth.user = null; await settle()
  expect(images()).toHaveLength(0)
  expect(auth.photoSrc).toBe('')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar')
})

it('releases a cached blob when the auth store is disposed', async () => {
  await mount()
  disposePinia(pinia)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:avatar')
})

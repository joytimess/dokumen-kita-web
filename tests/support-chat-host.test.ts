// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, type App } from 'vue'
import { createPinia, disposePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import SupportChatHost from '../src/components/support/SupportChatHost.vue'
import { useAuthStore } from '../src/stores/auth'
import { useSupportChatStore } from '../src/stores/support-chat'
import { language, setWorkspaceActive } from '../src/services/workspace-language'
import { confirmation, finishConfirmation } from '../src/services/feedback'

vi.mock('../src/services/http', () => ({ authMode: 'api' }))
vi.mock('../src/services/support-chat.service', async (original) => ({ ...await original<typeof import('../src/services/support-chat.service')>(), supportChatApi: { send: vi.fn() } }))
let app: App | undefined
let host: HTMLDivElement
let pinia: Pinia
let router: Router
const options = reactive({ blocked: false })
const user = { guid: 'user-a', name: 'User', email: 'user@example.test', email_verified: true, photo_url: null }
const paths = ['/dashboard', '/documents', '/categories', '/history', '/signature-assets', '/profile', '/login', '/register', '/', '/documents/00000000-0000-0000-0000-000000000000', '/documents/00000000-0000-0000-0000-000000000000/edit', '/documents/00000000-0000-0000-0000-000000000000/versions/version/view', '/invitations/claim']
async function settle() { for (let i = 0; i < 8; i++) { await Promise.resolve(); await nextTick() } }
async function mount(path = '/documents', authenticated = true) {
  pinia = createPinia()
  const auth = useAuthStore(pinia)
  if (authenticated) auth.setUser(user)
  router = createRouter({ history: createMemoryHistory(), routes: paths.map((route) => ({ path: route, component: { render: () => null } })) })
  await router.push(path)
  host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h(SupportChatHost, options) })
  app.use(pinia).use(router).mount(host); await settle()
  return { auth, chat: useSupportChatStore(pinia) }
}

beforeEach(() => { vi.useFakeTimers(); sessionStorage.clear(); options.blocked = false; language.value = 'id'; setWorkspaceActive(true); vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) })
afterEach(() => { app?.unmount(); app = undefined; if (pinia) disposePinia(pinia); host?.remove(); finishConfirmation(false); vi.useRealTimers(); vi.restoreAllMocks(); setWorkspaceActive(false) })

it('delays contextual invitation five seconds, translates its route copy and suppresses it for the rest of the session after dismissal', async () => {
  const { chat } = await mount()
  expect(host.querySelector('[aria-controls=support-chat-panel]')).toBeTruthy()
  await vi.advanceTimersByTimeAsync(4999); await settle()
  expect(host.querySelector('.support-invitation')).toBeNull()
  await vi.advanceTimersByTimeAsync(1); await settle()
  expect(host.querySelector('.support-invitation')?.textContent).toContain('Butuh bantuan mengelola dokumen?')
  expect(chat.invitationDismissed).toBe(true)
  language.value = 'en'; await settle()
  expect(host.querySelector('.support-invitation')?.textContent).toContain('Need help managing documents?')
  host.querySelector<HTMLButtonElement>('.support-invitation button[aria-label]')!.click()
  await vi.advanceTimersByTimeAsync(250); await settle()
  expect(host.querySelector('.support-invitation')).toBeNull()
  await router.push('/profile'); await vi.advanceTimersByTimeAsync(10000); await settle()
  expect(host.querySelector('.support-invitation')).toBeNull()
})

it.each([['/profile', 'Perlu bantuan mengatur profil?'], ['/signature-assets', 'Bingung cara menandatangani dokumen?'], ['/history', 'Bingung cara menandatangani dokumen?']])('uses actual route context for %s', async (path, copy) => {
  await mount(path); await vi.advanceTimersByTimeAsync(5000); await settle()
  expect(host.querySelector('.support-invitation')?.textContent).toContain(copy)
})

it('opening the launcher suppresses invitations and connects draft and submission events to the shared store', async () => {
  const { chat } = await mount()
  const send = vi.spyOn(chat, 'send').mockResolvedValue()
  host.querySelector<HTMLButtonElement>('[aria-controls=support-chat-panel]')!.click(); await settle()
  expect(chat.open).toBe(true); expect(chat.invitationDismissed).toBe(true)
  const textarea = host.querySelector<HTMLTextAreaElement>('#support-chat-draft')!
  textarea.value = 'Pertanyaan'; textarea.dispatchEvent(new Event('input')); await settle()
  expect(chat.draft).toBe('Pertanyaan')
  host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await settle()
  expect(send).toHaveBeenCalledOnce()
  host.querySelector<HTMLButtonElement>('[aria-label="Tutup bantuan"]')!.click(); await settle()
  expect(chat.open).toBe(false)
  await vi.advanceTimersByTimeAsync(10000); await settle()
  expect(host.querySelector('.support-invitation')).toBeNull()
})

it.each(['/login', '/register', '/', '/documents/00000000-0000-0000-0000-000000000000/edit', '/documents/00000000-0000-0000-0000-000000000000/versions/version/view', '/invitations/claim'])('hides chatbot on public or sensitive workflow route %s', async (path) => {
  await mount(path); await vi.advanceTimersByTimeAsync(10000); await settle()
  expect(host.querySelector('[data-support-chat]')).toBeNull()
})

it('requires an authenticated user and closes without losing draft when a workflow blocks the host', async () => {
  const { auth, chat } = await mount('/documents', false)
  expect(host.querySelector('[data-support-chat]')).toBeNull()
  auth.setUser(user); await settle()
  chat.openChat(); chat.draft = 'Belum terkirim'; await settle()
  options.blocked = true; await settle()
  expect(host.querySelector('[data-support-chat]')).toBeNull(); expect(chat.open).toBe(false)
  expect(chat.draft).toBe('Belum terkirim')
  options.blocked = false; await settle()
  expect(host.querySelector('[data-support-chat]')).toBeTruthy()
})

it('gives native and ARIA modals priority, resets the invitation delay and ignores its own mobile dialog', async () => {
  await mount()
  const modal = document.createElement('dialog'); document.body.append(modal)
  try {
    modal.setAttribute('open', ''); await settle()
    expect(host.querySelector('[data-support-chat]')).toBeNull()
    await vi.advanceTimersByTimeAsync(10000); await settle()
    modal.removeAttribute('open'); await settle()
    expect(host.querySelector('[data-support-chat]')).toBeTruthy()
    await vi.advanceTimersByTimeAsync(4999); await settle()
    expect(host.querySelector('.support-invitation')).toBeNull()
    modal.setAttribute('aria-modal', 'true'); await settle()
    expect(host.querySelector('[data-support-chat]')).toBeNull()
  } finally { modal.remove(); await settle() }
  const own = host.querySelector('[data-support-chat]')!
  own.setAttribute('aria-modal', 'true'); await settle()
  expect(host.querySelector('[data-support-chat]')).toBeTruthy()
})

it('suppresses chatbot while an application confirmation is active', async () => {
  await mount()
  confirmation.value = { title: 'Konfirmasi', message: 'Lanjut?', action: 'Ya', danger: false, resolve: vi.fn() }; await settle()
  expect(host.querySelector('[data-support-chat]')).toBeNull()
  finishConfirmation(false); await settle()
  expect(host.querySelector('[data-support-chat]')).toBeTruthy()
})

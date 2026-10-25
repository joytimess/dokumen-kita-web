// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, reactive, type App } from 'vue'
import SupportChatWidget from '../src/components/support/SupportChatWidget.vue'
import { language, setWorkspaceActive } from '../src/services/workspace-language'
import type { SupportChatProps } from '../src/types/support-chat'

let app: App | undefined
let host: HTMLDivElement
let mobile = false
let props: SupportChatProps
const emitted = { send: vi.fn(), retry: vi.fn(), dismiss: vi.fn() }
async function settle() { for (let i = 0; i < 6; i++) { await Promise.resolve(); await nextTick() } }
async function mount(overrides: Partial<SupportChatProps> = {}) {
  props = reactive({ open: false, messages: [], draft: '', loading: false, error: null, suggestions: [], invitation: '', ...overrides })
  host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h(SupportChatWidget, { ...props, onOpen: () => { props.open = true }, onClose: () => { props.open = false }, 'onUpdate:draft': (value: string) => { props.draft = value }, onSend: emitted.send, onRetry: emitted.retry, 'onDismiss-invitation': emitted.dismiss }) })
  app.mount(host); await settle()
}
function launcher() { return host.querySelector<HTMLButtonElement>('button[aria-controls=support-chat-panel]')! }
function composer() { return host.querySelector<HTMLTextAreaElement>('#support-chat-draft')! }
function submit() { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) }
function key(keyValue: string, options: KeyboardEventInit = {}) { return new KeyboardEvent('keydown', { key: keyValue, bubbles: true, cancelable: true, ...options }) }

beforeEach(() => {
  mobile = false; language.value = 'id'; setWorkspaceActive(true)
  vi.clearAllMocks()
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: query === '(max-width: 599px)' && mobile, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }))
})
afterEach(() => { app?.unmount(); app = undefined; host?.remove(); document.body.style.overflow = ''; vi.useRealTimers(); vi.restoreAllMocks(); setWorkspaceActive(false) })

it('opens the compact desktop panel, focuses its composer, closes with Escape and restores launcher focus without locking page scroll', async () => {
  document.body.style.overflow = 'auto'
  await mount()
  expect(launcher().getAttribute('aria-label')).toBeTruthy()
  expect(host.querySelector('#support-chat-panel')).toBeNull()
  launcher().click(); await settle()
  expect(host.querySelector('#support-chat-panel')?.getAttribute('role')).toBe('dialog')
  expect(host.querySelector('#support-chat-panel')?.hasAttribute('aria-modal')).toBe(false)
  expect(document.activeElement).toBe(composer())
  expect(document.body.style.overflow).toBe('auto')
  composer().dispatchEvent(key('Escape')); await settle()
  expect(props.open).toBe(false)
  expect(document.activeElement).toBe(launcher())
})

it('uses mobile dialog behavior, traps keyboard focus and restores background interaction and scroll on close', async () => {
  mobile = true
  const background = document.createElement('button'); document.body.append(background)
  try {
    await mount(); launcher().click(); await settle()
    const panel = host.querySelector('#support-chat-panel')!
    expect(panel.classList.contains('support-panel-mobile')).toBe(true)
    expect(panel.getAttribute('aria-modal')).toBe('true')
    expect(document.body.style.overflow).toBe('hidden')
    expect(background.inert).toBe(true)
    const buttons = panel.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    buttons[0]!.focus(); buttons[0]!.dispatchEvent(key('Tab', { shiftKey: true }))
    expect(document.activeElement).toBe(composer())
    composer().dispatchEvent(key('Tab'))
    expect(document.activeElement).toBe(buttons[0])
    buttons[0]!.click(); await settle()
    expect(document.body.style.overflow).toBe('')
    expect(background.inert).toBe(false)
  } finally { background.remove() }
})

it('does not steal existing page focus when mounting or resizing a closed mobile widget', async () => {
  mobile = true
  const input = document.createElement('input'); document.body.append(input); input.focus()
  try {
    await mount()
    expect(document.activeElement).toBe(input)
    mobile = false; window.dispatchEvent(new Event('resize')); await settle()
    expect(document.activeElement).toBe(input)
    mobile = true; window.dispatchEvent(new Event('resize')); await settle()
    expect(document.activeElement).toBe(input)
  } finally { input.remove() }
})

it('preserves transcript and draft when resizing between desktop and mobile', async () => {
  await mount({ open: true, draft: 'Draft tetap', messages: [{ id: '1', role: 'user', text: 'Pesan tetap', createdAt: new Date().toISOString() }] })
  mobile = true; window.dispatchEvent(new Event('resize')); await settle()
  expect(host.querySelector('#support-chat-panel')?.classList.contains('support-panel-mobile')).toBe(true)
  expect(composer().value).toBe('Draft tetap'); expect(host.textContent).toContain('Pesan tetap')
  mobile = false; window.dispatchEvent(new Event('resize')); await settle()
  expect(host.querySelector('#support-chat-panel')?.classList.contains('support-panel-mobile')).toBe(false)
  expect(document.body.style.overflow).toBe('')
  expect(composer().value).toBe('Draft tetap')
})

it('tracks the mobile visual viewport when the on-screen keyboard reduces available height', async () => {
  mobile = true
  const viewport = new EventTarget() as VisualViewport
  Object.defineProperties(viewport, { offsetTop: { value: 12, configurable: true }, offsetLeft: { value: 0 }, width: { value: 375 }, height: { value: 640, configurable: true } })
  const descriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport')
  Object.defineProperty(window, 'visualViewport', { value: viewport, configurable: true })
  try {
    await mount({ open: true, draft: 'Tetap terlihat' })
    const panel = host.querySelector<HTMLElement>('#support-chat-panel')!
    expect(panel.style.height).toBe('640px'); expect(panel.style.width).toBe('375px')
    Object.defineProperty(viewport, 'height', { value: 320, configurable: true })
    viewport.dispatchEvent(new Event('resize')); await settle()
    expect(panel.style.height).toBe('320px'); expect(panel.style.top).toBe('12px')
    expect(composer().value).toBe('Tetap terlihat')
  } finally {
    app?.unmount(); app = undefined
    if (descriptor) Object.defineProperty(window, 'visualViewport', descriptor)
    else Reflect.deleteProperty(window, 'visualViewport')
  }
})

it('supports Enter send, Shift+Enter newline, IME composition, empty validation and visible character limits', async () => {
  await mount({ open: true })
  submit(); expect(emitted.send).not.toHaveBeenCalled()
  composer().value = 'Pertanyaan'; composer().dispatchEvent(new Event('input', { bubbles: true })); await settle()
  expect(props.draft).toBe('Pertanyaan')
  composer().dispatchEvent(key('Enter', { shiftKey: true }))
  composer().dispatchEvent(key('Enter', { isComposing: true }))
  expect(emitted.send).not.toHaveBeenCalled()
  composer().dispatchEvent(key('Enter')); expect(emitted.send).toHaveBeenCalledOnce()
  emitted.send.mockClear(); props.draft = 'x'.repeat(2001); await settle()
  expect(composer().maxLength).toBe(2000)
  expect(composer().getAttribute('aria-invalid')).toBe('true')
  expect(host.textContent).toContain('Maksimum 2000 karakter.')
  submit(); expect(emitted.send).not.toHaveBeenCalled()
})

it('announces loading, disables duplicate submit and suggestions, but leaves draft editable', async () => {
  await mount({ open: true, draft: 'Pertanyaan', loading: true, suggestions: ['Cara impor?'] })
  expect(host.querySelector('[role=status]')?.textContent).toContain('Sedang menyiapkan jawaban')
  expect(host.querySelector<HTMLButtonElement>('button[type=submit]')?.disabled).toBe(true)
  expect(composer().disabled).toBe(false)
  submit(); expect(emitted.send).not.toHaveBeenCalled()
  const suggestion = [...host.querySelectorAll('button')].find((button) => button.textContent === 'Cara impor?')!
  expect(suggestion.disabled).toBe(true)
  props.loading = false; await settle(); suggestion.click()
  expect(emitted.send).toHaveBeenCalledWith('Cara impor?')
})

it('renders user and assistant content as plain text including hostile HTML and external links', async () => {
  const attack = '<img src=x onerror="window.hacked=true"><script>alert(1)</script> https://evil.example'
  await mount({ open: true, messages: [{ id: 'u', role: 'user', text: attack, createdAt: new Date().toISOString() }, { id: 'a', role: 'assistant', text: attack, createdAt: new Date().toISOString() }] })
  expect([...host.querySelectorAll('.support-message')].map((element) => element.textContent)).toEqual([attack, attack])
  expect(host.querySelector('img,script,a')).toBeNull()
})

it('updates UI labels when workspace language changes and emits invitation dismissal or opening', async () => {
  vi.useFakeTimers()
  await mount({ invitation: 'Butuh bantuan mengelola dokumen?' })
  host.querySelector<HTMLButtonElement>('[aria-label="Tutup undangan bantuan"]')!.click()
  expect(emitted.dismiss).toHaveBeenCalledOnce()
  language.value = 'en'; await settle()
  expect(launcher().getAttribute('aria-label')).toBe('Open Dokumen Kita support')
  host.querySelector<HTMLButtonElement>('.support-invitation button')!.click(); await settle()
  await vi.advanceTimersByTimeAsync(250); await settle()
  expect(host.querySelector('.support-invitation')).toBeNull()
  expect(host.querySelector('[aria-label="Close support"]')).toBeTruthy()
})

it('presents recoverable errors with retry and unauthenticated errors without an unsafe retry', async () => {
  await mount({ open: true, error: { kind: 'unavailable', retryAt: null } })
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Pesan Anda tetap tersimpan')
  host.querySelector<HTMLButtonElement>('[role=alert] button')!.click()
  expect(emitted.retry).toHaveBeenCalledOnce()
  props.error = { kind: 'unauthenticated', retryAt: null }; await settle()
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Sesi Anda berakhir')
  expect(host.querySelector('[role=alert] button')).toBeNull()
})

it('announces rate-limit cooldown and enables retry only after Retry-After expires', async () => {
  vi.useFakeTimers()
  await mount({ open: true, error: { kind: 'rate-limit', retryAt: Date.now() + 2000 } })
  const retry = host.querySelector<HTMLButtonElement>('[role=alert] button')!
  expect(retry.disabled).toBe(true)
  expect(host.querySelector('[role=alert]')?.textContent).toContain('2 detik')
  await vi.advanceTimersByTimeAsync(2100); await settle()
  expect(retry.disabled).toBe(false)
})

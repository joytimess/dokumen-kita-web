// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import SignersForm from '../src/components/documents/SignersForm.vue'
import DocumentDetailView from '../src/views/workspace/DocumentDetailView.vue'
import DocumentViewerView from '../src/views/workspace/DocumentViewerView.vue'
import PlaceholderPanel from '../src/components/documents/PlaceholderPanel.vue'
import { useAuthStore } from '../src/stores/auth'
import { language } from '../src/services/workspace-language'
import { http } from '../src/services/http'
import type { Assignment, DocumentRecord, SigningMode } from '../src/types/documents'

const api = vi.hoisted(() => ({ signers: vi.fn(), detail: vi.fn(), version: vi.fn(), audit: vi.fn(), versions: vi.fn(), emails: vi.fn() }))
const feedback = vi.hoisted(() => ({ confirmAction: vi.fn(), notify: { error: vi.fn(), success: vi.fn() } }))
vi.mock('../src/services/documents.service', () => ({ documentsApi: api }))
vi.mock('../src/services/feedback', () => feedback)
vi.mock('../src/components/documents/PdfViewer.vue', () => ({ default: { render: () => null } }))
vi.mock('../src/components/documents/SigningQrPanel.vue', () => ({ default: { render: () => null } }))
vi.mock('../src/components/signatures/SigningSession.vue', () => ({ default: {
  props: ['assignment'],
  render(this: { assignment: Assignment }) { return h('div', { 'data-testid': 'signing-session' }, this.assignment.guid) },
} }))
vi.mock('../src/services/http', async (original) => ({
  ...(await original<typeof import('../src/services/http')>()), authMode: 'api',
}))

const assignments: Assignment[] = ['a@example.test', 'b@example.test'].map((email, index) => ({
  guid: `assignment-${index}`, version_guid: 'version', recipient_email: email,
  sequence_number: index + 1, status: 'waiting', claimed_at: null,
  placeholders: [{ page_number: 1, x: 0, y: 0, width: 0.2, height: 0.1 }],
}))
let app: App | undefined
let host: HTMLDivElement
const adapter = http.defaults.adapter
async function settle() {
  for (let i = 0; i < 15; i++) { await Promise.resolve(); await nextTick() }
}
function button(label: string) {
  const result = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === label)
  expect(result, label).toBeTruthy()
  return result!
}
async function choose(label: string) {
  host.querySelector<HTMLElement>('[role=combobox]')!.click()
  await settle()
  const option = [...host.querySelectorAll<HTMLElement>('[role=option]')].find((item) => item.textContent?.trim() === label)
  expect(option).toBeTruthy()
  option!.click()
  await settle()
}
async function mountForm(signingMode?: SigningMode, readonly = false) {
  app = createApp({ render: () => h(SignersForm, {
    versionGuid: 'version', assignments, signingMode, readonly, flush: async () => true,
  }) })
  app.use(createPinia()).mount(host)
  await settle()
}
beforeEach(() => {
  vi.resetAllMocks()
  language.value = 'id'
  feedback.confirmAction.mockResolvedValue(true)
  api.signers.mockResolvedValue({})
  host = document.createElement('div')
  document.body.append(host)
})
afterEach(() => {
  app?.unmount()
  app = undefined
  host.remove()
  http.defaults.adapter = adapter
  vi.unstubAllEnvs()
})

it('defaults to Sequential and keeps its ordering controls', async () => {
  await mountForm()
  expect(host.querySelector('[role=combobox]')?.textContent).toContain('Sequential (Berurutan)')
  expect(host.querySelector('[aria-label="Turunkan penerima 1"]')).not.toBeNull()
  button('Simpan perubahan').click()
  await settle()
  expect(api.signers).toHaveBeenCalledWith('version', ['a@example.test', 'b@example.test'], 'sequential')
})

it('switches modes, hides irrelevant ordering controls and retains the saved order and positions', async () => {
  await mountForm()
  await choose('Parallel (Bebas Urutan)')
  expect(host.querySelector('[aria-label="Turunkan penerima 1"]')).toBeNull()
  expect(host.textContent).toContain('tanpa menunggu satu sama lain')
  expect(host.textContent).toContain('Perubahan penerima belum tersimpan.')
  expect([...host.querySelectorAll<HTMLInputElement>('input[type=email]')].map((input) => input.value)).toEqual(['a@example.test', 'b@example.test'])
  button('Simpan perubahan').click()
  await settle()
  expect(api.signers).toHaveBeenLastCalledWith('version', ['a@example.test', 'b@example.test'], 'parallel')
  await choose('Sequential (Berurutan)')
  expect(host.querySelector('[aria-label="Turunkan penerima 1"]')).not.toBeNull()
  expect(assignments.every((assignment) => assignment.placeholders?.length === 1)).toBe(true)
  button('Simpan perubahan').click()
  await settle()
  expect(api.signers).toHaveBeenLastCalledWith('version', ['a@example.test', 'b@example.test'], 'sequential')
})

it('continues to validate recipient email in Parallel mode', async () => {
  await mountForm('parallel')
  const field = host.querySelector<HTMLInputElement>('input[type=email]')!
  field.value = 'invalid'
  field.dispatchEvent(new Event('input', { bubbles: true }))
  button('Simpan perubahan').click()
  await settle()
  expect(host.textContent).toContain('Gunakan email valid dan unik')
  expect(api.signers).not.toHaveBeenCalled()
})

it('renders a published mode as read-only and prevents saving it', async () => {
  await mountForm('parallel', true)
  expect(host.textContent).toContain('Parallel (Bebas Urutan)')
  expect(host.querySelector('[role=combobox]')).toBeNull()
  expect(host.querySelector('fieldset')?.disabled).toBe(true)
  button('Simpan perubahan').click()
  await settle()
  expect(api.signers).not.toHaveBeenCalled()
})

it('hides Parallel ordering in placement and leaves mode unchanged when updating recipients there', async () => {
  api.signers.mockResolvedValue({ assignments: [assignments[1]] })
  app = createApp({ render: () => h(PlaceholderPanel, {
    versionGuid: 'version', hash: 'hash', pages: 1, assignments, signingMode: 'parallel', flush: async () => true,
  }) })
  app.use(createPinia()).mount(host)
  await settle()
  expect(host.querySelector('[aria-label="Turunkan penerima 1"]')).toBeNull()
  host.querySelector<HTMLButtonElement>('[aria-label="Hapus penerima 1"]')!.click()
  await settle()
  expect(api.signers).toHaveBeenCalledWith('version', ['b@example.test'])
})

it.each([
  ['parallel', 'ready', true], ['sequential', 'waiting', false],
] as const)('uses backend assignment eligibility in the %s viewer for signer B', async (mode, status, eligible) => {
  api.version.mockResolvedValue({
    guid: 'version', document_guid: 'document', document_title: 'Perjanjian', version_number: 1,
    signing_mode: mode, status: 'in_progress', preview_status: 'ready', content_hash: 'hash', is_current: true,
    assignments: [{ ...assignments[1], status }],
  })
  const pinia = createPinia()
  useAuthStore(pinia).user = { guid: 'signer-b', name: 'B', email: 'b@example.test', email_verified: true }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/documents/:documentGuid/versions/:versionGuid/view', component: DocumentViewerView },
    { path: '/documents/:documentGuid', component: { render: () => null } },
  ] })
  await router.push('/documents/document/versions/version/view')
  app = createApp({ render: () => h(DocumentViewerView) })
  app.use(pinia).use(router).mount(host)
  await settle()
  expect(!!host.querySelector('[data-testid="signing-session"]')).toBe(eligible)
  expect(host.textContent?.includes('Menunggu giliran.')).toBe(!eligible)
})

it('displays owner progress from backend counters rather than inferring it from the rendered assignment list', async () => {
  const record = {
    guid: 'document', public_reference: 'DK-1', title: 'Perjanjian', status: 'in_progress', owner_guid: 'owner',
    hidden_at: null, is_hidden: false, created_at: '2026-10-27T00:00:00Z', updated_at: '2026-10-27T00:00:00Z',
    current_version: {
      guid: 'version', document_guid: 'document', version_number: 1, status: 'in_progress', preview_status: 'ready',
      signing_mode: 'parallel', signing_progress: { signed_count: 2, signer_count: 3 }, assignments,
      updated_at: '2026-10-27T00:00:00Z', published_at: '2026-10-27T00:00:00Z',
    },
  } satisfies DocumentRecord
  api.detail.mockResolvedValue(record)
  const page = { data: [], meta: { total: 0, current_page: 1, last_page: 1, per_page: 15 }, links: { prev: null, next: null } }
  for (const method of [api.audit, api.versions, api.emails]) method.mockResolvedValue(page)
  const pinia = createPinia()
  useAuthStore(pinia).user = { guid: 'owner', name: 'Owner', email: 'owner@example.test', email_verified: true }
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/documents/:documentGuid', component: DocumentDetailView },
    { path: '/documents/:documentGuid/edit', component: { render: () => null } },
    { path: '/documents/:documentGuid/versions/:versionGuid/view', component: { render: () => null } },
  ] })
  await router.push('/documents/document')
  app = createApp({ render: () => h(DocumentDetailView) })
  app.use(pinia).use(router).mount(host)
  await settle()
  expect(host.textContent).toContain('Parallel (Bebas Urutan)')
  expect(host.textContent).toContain('2 dari 3 penandatangan selesai')
  expect(host.querySelector('[aria-label="Metode Penandatanganan"]')).toBeNull()
})

it.each(['sequential', 'parallel', undefined] as const)('sends %s through the existing signers endpoint with stable sequence numbers', async (mode) => {
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test')
  const actual = await vi.importActual<typeof import('../src/services/documents.service')>('../src/services/documents.service')
  let mutations = 0
  http.defaults.adapter = async (config) => {
    if (config.method === 'put') {
      mutations++
      expect(http.getUri(config)).toBe('https://api.example.test/api/v1/versions/version/signers')
      expect(JSON.parse(config.data)).toEqual({ ...(mode ? { signing_mode: mode } : {}), signers: [
        { email: 'a@example.test', sequence_number: 1 }, { email: 'b@example.test', sequence_number: 2 },
      ] })
    }
    return { data: { data: {} }, status: 200, statusText: 'OK', headers: {}, config }
  }
  await actual.documentsApi.signers('version', ['a@example.test', 'b@example.test'], mode)
  expect(mutations).toBe(1)
})

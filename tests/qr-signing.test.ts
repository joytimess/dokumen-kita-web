// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import QrSigningView from '../src/views/auth/QrSigningView.vue'
import SigningQrPanel from '../src/components/documents/SigningQrPanel.vue'
import { useAuthStore } from '../src/stores/auth'
import { clearSigningQr, pendingSigningQr, rememberSigningQr, qrStatusLabel } from '../src/utils/signingQr'
import { clearInvitation, rememberInvitation } from '../src/utils/invitation'
import { afterAuthentication } from '../src/utils/authRedirect'
import { authApi } from '../src/services/auth.service'
import router from '../src/router'

const qr = vi.hoisted(() => ({ metadata: vi.fn(), image: vi.fn(), resolve: vi.fn(), claim: vi.fn() }))
vi.mock('../src/services/signing-qr.service', () => ({ signingQrApi: qr }))
vi.mock('../src/services/http', async (original) => ({
  ...(await original<typeof import('../src/services/http')>()), authMode: 'api',
}))
vi.mock('vue-router', async (original) => {
  const actual = await original<typeof import('vue-router')>()
  return { ...actual, createWebHistory: actual.createMemoryHistory }
})
vi.mock('../src/layouts/AuthLayout.vue', () => ({ default: { props: ['compact'], render(this: { $slots: { default: () => unknown } }) { return this.$slots.default() } } }))
vi.mock('../src/layouts/WorkspaceLayout.vue', () => ({ default: {} }))
vi.mock('../src/views/workspace/DocumentsView.vue', () => ({ default: {} }))
vi.mock('../src/views/workspace/DocumentViewerView.vue', () => ({ default: {} }))

const token = 'a'.repeat(64)
const user = { guid: 'user', name: 'Signer', email: 'signer@example.test', email_verified: true }
let app: App | undefined
let host: HTMLDivElement
async function settle() { for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() } }
beforeEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
  clearSigningQr(); clearInvitation(); sessionStorage.clear()
  setActivePinia(createPinia())
  host = document.createElement('div'); document.body.append(host)
  qr.resolve.mockResolvedValue({ status: 'active' })
  qr.claim.mockResolvedValue({ status: 'waiting' })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:qr-preview')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})
afterEach(() => { app?.unmount(); app = undefined; host.remove(); clearSigningQr(); clearInvitation(); vi.unstubAllGlobals() })

async function mountEntry(verified: boolean | null = true, actualRouter = false) {
  rememberSigningQr(token)
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore()
  if (verified !== null) auth.setUser({ ...user, email_verified: verified })
  else vi.spyOn(auth, 'restore').mockResolvedValue()
  const localRouter = actualRouter ? router : createRouter({ history: createMemoryHistory(), routes: [
    { path: '/sign/qr', component: QrSigningView },
    { path: '/:pathMatch(.*)*', component: { render: () => null } },
  ] })
  await localRouter.push('/sign/qr')
  app = createApp({ render: () => h(QrSigningView) })
  app.use(pinia).use(localRouter).mount(host)
  await settle()
  return { auth, router: localRouter }
}

it('scrubs scanned token before auth and preserves QR across login and verification', async () => {
  const me = vi.spyOn(authApi, 'me')
  rememberInvitation('b'.repeat(64))
  await router.push(`/sign/qr/${token}`)
  expect(router.currentRoute.value.fullPath).toBe('/sign/qr')
  expect(pendingSigningQr()).toBe(token)
  expect(me).not.toHaveBeenCalled()
  expect(afterAuthentication(false, '/sign/qr')).toBe('/email/verify?redirect=%2Fsign%2Fqr')
  useAuthStore().setUser(user)
  await router.push('/login?redirect=/dashboard')
  expect(router.currentRoute.value.path).toBe('/sign/qr')
})

it('rejects malformed scanned tokens and removes previous context', async () => {
  rememberSigningQr(token)
  await router.push('/sign/qr/not-a-token')
  expect(router.currentRoute.value.fullPath).toBe('/sign/qr?error=invalid')
  expect(pendingSigningQr()).toBe('')
})

it('offers Google and existing login/register without claiming for anonymous visitors', async () => {
  await mountEntry(null)
  expect(host.textContent).toContain('Continue with Google')
  expect(host.querySelector('a[href="/login?redirect=/sign/qr"]')).not.toBeNull()
  expect(qr.claim).not.toHaveBeenCalled()
  const google = vi.spyOn(authApi, 'google').mockResolvedValue()
  host.querySelector('button')!.click(); await settle()
  expect(google).toHaveBeenCalledWith('/sign/qr')
})

it('uses active session and redirects only an authorized assignment to the existing viewer', async () => {
  const doc = '11111111-1111-4111-8111-111111111111', version = '22222222-2222-4222-8222-222222222222'
  qr.claim.mockResolvedValue({ status: 'active', document_guid: doc, version_guid: version, assignment_guid: 'assignment' })
  const result = await mountEntry()
  expect(qr.claim).toHaveBeenCalledWith(token)
  expect(result.router.currentRoute.value.path).toBe(`/documents/${doc}/versions/${version}/view`)
  expect(pendingSigningQr()).toBe('')
})

it.each(['waiting', 'already_signed', 'not_assigned'])('shows %s without opening document', async (status) => {
  qr.claim.mockResolvedValue({ status })
  const result = await mountEntry()
  expect(result.router.currentRoute.value.path).toBe('/sign/qr')
  expect(host.querySelector('[role="status"]')?.textContent).toBeTruthy()
  expect(host.textContent).not.toContain('Continue with Google')
  expect(host.textContent).toContain(qrStatusLabel(status))
  expect(pendingSigningQr()).toBe(status === 'already_signed' ? '' : token)
})

it.each(['revoked', 'superseded', 'finalizing', 'completed', 'invalid'])('does not claim a %s QR', async (status) => {
  qr.resolve.mockResolvedValue({ status })
  await mountEntry()
  expect(qr.claim).not.toHaveBeenCalled()
  expect(host.querySelector('[role="status"]')?.textContent).toBeTruthy()
  expect(host.textContent).toContain(qrStatusLabel(status))
  expect(pendingSigningQr()).toBe('')
})

it('replaces token and resolves another scan while QR entry remains mounted', async () => {
  await mountEntry(true, true)
  expect(qr.claim).toHaveBeenLastCalledWith(token)
  const nextToken = 'b'.repeat(64)
  await router.push(`/sign/qr/${nextToken}`)
  await settle()
  expect(qr.resolve).toHaveBeenLastCalledWith(nextToken)
  expect(qr.claim).toHaveBeenLastCalledWith(nextToken)
  expect(pendingSigningQr()).toBe(nextToken)
  expect(router.currentRoute.value.fullPath).toBe('/sign/qr')
  await router.push('/sign/qr/malformed')
  await settle()
  expect(pendingSigningQr()).toBe('')
  expect(host.textContent).toContain(qrStatusLabel('invalid'))
})

it('sends unverified account through existing verification with QR return context', async () => {
  const result = await mountEntry(false)
  expect(result.router.currentRoute.value.path).toBe('/email/verify')
  expect(result.router.currentRoute.value.query.redirect).toBe('/sign/qr')
  expect(qr.claim).not.toHaveBeenCalled()
  expect(pendingSigningQr()).toBe(token)
})

it('previews protected SVG as an image, copies link, and revokes object URL', async () => {
  qr.metadata.mockResolvedValue({ status: 'active', signing_url: `https://frontend.test/sign/qr/${token}`, svg_url: '/unused' })
  qr.image.mockResolvedValue(new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: 'image/svg+xml' }))
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  app = createApp({ render: () => h(SigningQrPanel, { versionGuid: 'version', versionStatus: 'in_progress' }) })
  app.mount(host); await settle()
  expect(qr.image).toHaveBeenCalledWith('version')
  expect(host.querySelector('img')?.src).toBe('blob:qr-preview')
  expect(host.textContent).toContain('Siap digunakan')
  expect(host.textContent).toContain('Aktif')
  const copy = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Salin'))!
  copy.click(); await settle()
  expect(writeText).toHaveBeenCalledWith(`https://frontend.test/sign/qr/${token}`)
  const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('signing-qr-version.svg')
  })
  const download = [...host.querySelectorAll('button')].find((button) => button.textContent?.includes('Unduh'))!
  download.click(); await settle()
  expect(qr.image).toHaveBeenLastCalledWith('version', true)
  expect(anchor).toHaveBeenCalledOnce()
  app.unmount(); app = undefined
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:qr-preview')
})

it.each(['revoked', 'completed', 'superseded', 'invalid'])('shows the actual %s status without active labels', async (status) => {
  qr.metadata.mockResolvedValue({ status, signing_url: 'https://frontend.test/sign/qr/token', svg_url: '/unused' })
  qr.image.mockResolvedValue(new Blob(['<svg/>'], { type: 'image/svg+xml' }))
  app = createApp({ render: () => h(SigningQrPanel, { versionGuid: 'version', versionStatus: status }) })
  app.mount(host); await settle()
  expect(host.textContent).toContain(qrStatusLabel(status))
  expect(host.textContent).not.toContain('Siap digunakan')
  expect(host.textContent).not.toContain('Aktif')
})

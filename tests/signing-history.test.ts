// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia } from 'pinia'
import SigningHistoryView from '../src/views/workspace/SigningHistoryView.vue'
import { language } from '../src/services/workspace-language'
import type { SigningHistoryEvent } from '../src/services/history.service'

const api = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), version: vi.fn() }))
vi.mock('../src/services/history.service', () => ({ historyApi: api }))
vi.mock('../src/services/documents.service', () => ({ documentsApi: { version: api.version } }))

const event: SigningHistoryEvent = {
  guid: 'activity-1', action: 'assignment.signed', occurred_at: '2026-10-19T01:30:00Z',
  document: { guid: 'document-1', title: 'Perjanjian kerja sama '.repeat(12), status: 'completed',
    owner: { guid: 'owner', name: 'Pemilik dokumen', email: `${'pemilik'.repeat(15)}@example.test` } },
  version_guid: 'version-1', can_access_document: true, actor_snapshot_available: true,
  actor_snapshot: { name: 'Penanda tangan', email: 'signer@example.test' },
}
const router = createRouter({ history: createMemoryHistory(), routes: [
  { path: '/history', component: SigningHistoryView },
  { path: '/documents/:document/versions/:version/view', component: { render: () => null } },
] })
let app: App
let host: HTMLDivElement

async function settle() {
  for (let index = 0; index < 12; index++) {
    await Promise.resolve()
    await nextTick()
  }
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}
function button(label: string) {
  const result = Array.from(host.querySelectorAll('button')).find((item) => item.textContent?.trim().startsWith(label))
  expect(result, label).toBeTruthy()
  return result!
}
function input(selector: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(selector)!
  field.value = value
  field.dispatchEvent(new Event('input', { bubbles: true }))
}
beforeEach(async () => {
  vi.resetAllMocks()
  language.value = 'id'
  api.list.mockResolvedValue({ data: [event], meta: { current_page: 1, per_page: 10, total: 11, last_page: 2 }, links: { prev: null, next: '?page=2' } })
  api.detail.mockResolvedValue(event)
  api.version.mockResolvedValue({})
  await router.replace('/history')
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(SigningHistoryView) })
  app.use(createPinia()).use(router).mount(host)
  await settle()
})
afterEach(() => { app.unmount(); host.remove() })

it('renders complete identity, distinct statuses, WIB time and expandable historical details', async () => {
  expect(host.querySelector('h3')?.textContent).toBe(event.document.title)
  expect(host.textContent).toContain(event.document.owner.email)
  expect(host.textContent).toContain('Berhasil ditandatangani')
  expect(host.querySelector('time')?.textContent).toContain('08.30 WIB')
  button('Lihat detail').click()
  await settle()
  expect(api.detail).toHaveBeenCalledWith(event.guid)
  expect(host.querySelector('#history-detail-activity-1')?.textContent).toContain('signer@example.test')
  expect(host.querySelector('#history-detail-activity-1')?.textContent).toContain('Status dokumen saat ini:')
  expect(button('Tutup detail').getAttribute('aria-expanded')).toBe('true')
  button('Tutup detail').click()
  await settle()
  expect(host.querySelector('#history-detail-activity-1')).toBeNull()
})

it('applies and clears title/date filters, rejecting a reversed date range', async () => {
  input('[type=search]', '  Perjanjian  ')
  input('[type=date]', '2026-10-19')
  input('[type=date]:last-of-type', '2026-10-19')
  const dates = host.querySelectorAll<HTMLInputElement>('[type=date]')
  dates[1]!.value = '2026-10-18'
  dates[1]!.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  expect(button('Terapkan').disabled).toBe(true)
  expect(host.textContent).toContain('Tanggal akhir tidak boleh lebih awal')
  dates[1]!.value = '2026-10-20'
  dates[1]!.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await settle()
  expect(router.currentRoute.value.query).toEqual({ q: 'Perjanjian', date_from: '2026-10-19', date_to: '2026-10-20' })
  expect(api.list).toHaveBeenLastCalledWith({ q: 'Perjanjian', date_from: '2026-10-19', date_to: '2026-10-20', page: 1, perPage: 10 })
  button('Hapus filter').click()
  await settle()
  expect(router.currentRoute.value.query).toEqual({})
  expect(host.querySelector<HTMLInputElement>('[type=search]')?.value).toBe('')
})

it('retains previous/next states and page-size query behavior', async () => {
  expect(host.querySelector<HTMLButtonElement>('[aria-label=Sebelumnya]')?.disabled).toBe(true)
  host.querySelector<HTMLButtonElement>('[aria-label=Berikutnya]')!.click()
  await settle()
  expect(router.currentRoute.value.query.page).toBe('2')
  expect(api.list.mock.lastCall?.[0].page).toBe(2)
  let control = host.querySelector<HTMLElement>('[role=combobox][aria-label="Tampilkan baris"]')!
  expect(control.textContent).toContain('5')
  control.click()
  await settle()
  const options = [...host.querySelectorAll<HTMLElement>('[role=option]')]
  expect(options.find((option) => option.getAttribute('aria-selected') === 'true')?.textContent?.trim()).toBe('5')
  options.find((option) => option.textContent?.trim() === '25')!.click()
  await settle()
  expect(router.currentRoute.value.query.per_page).toBe('25')
  expect(router.currentRoute.value.query.page).toBeUndefined()
  expect(api.list.mock.lastCall?.[0].perPage).toBe(25)
  control = host.querySelector<HTMLElement>('[role=combobox][aria-label="Tampilkan baris"]')!
  expect(control.textContent).toContain('25')
  expect(control.getAttribute('aria-expanded')).toBe('false')
  control.click()
  await settle()
  host.querySelectorAll<HTMLElement>('[role=option]')[0]!.click()
  await settle()
  expect(router.currentRoute.value.query.per_page).toBeUndefined()
  expect(api.list.mock.lastCall?.[0].perPage).toBe(5)
})

it('checks access before navigating to the existing version viewer', async () => {
  button('Buka dokumen').click()
  await settle()
  expect(api.version).toHaveBeenCalledWith('version-1')
  expect(router.currentRoute.value.path).toBe('/documents/document-1/versions/version-1/view')
})

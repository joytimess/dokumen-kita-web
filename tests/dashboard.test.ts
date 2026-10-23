// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, type App } from 'vue'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'
import { createPinia } from 'pinia'
import { AxiosError } from 'axios'
import DocumentsView from '../src/views/workspace/DocumentsView.vue'
import { useAuthStore } from '../src/stores/auth'
import { setWorkspaceActive, setWorkspaceLanguage } from '../src/services/workspace-language'
import type { DocumentRecord, Page } from '../src/types/documents'

const api = vi.hoisted(() => ({
  list: vi.fn(), count: vi.fn(), create: vi.fn(), setVisibility: vi.fn(),
  pdf: vi.fn(), bulkAssignCategory: vi.fn(), assignCategory: vi.fn(), categories: vi.fn(),
}))
const feedback = vi.hoisted(() => ({
  confirmAction: vi.fn(), notify: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}))
vi.mock('../src/services/documents.service', () => ({ documentsApi: api }))
vi.mock('../src/services/categories.service', () => ({ categoriesApi: { list: api.categories } }))
vi.mock('../src/services/feedback', () => feedback)

let app: App | undefined
let host: HTMLDivElement
let router: Router
let documents: DocumentRecord[]
const category = { guid: 'category-1', name: 'Perjanjian', color_token: 'green' as const, description: null }

function record(guid: string, title: string, status = 'draft', hidden = false): DocumentRecord {
  return {
    guid, title, status, owner_guid: 'owner', public_reference: guid,
    hidden_at: hidden ? '2026-10-23T00:00:00Z' : null, is_hidden: hidden,
    category: guid === 'alpha' ? category : null, category_guid: guid === 'alpha' ? category.guid : null,
    created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z',
    current_version: {
      guid: `version-${guid}`, document_guid: guid, version_number: 1, status,
      preview_status: status === 'completed' ? 'ready' : 'none',
      updated_at: '2026-10-23T00:00:00Z', published_at: null,
    },
  }
}
function page(data: DocumentRecord[], number = 1, perPage = 10): Page<DocumentRecord> {
  const last = Math.max(1, Math.ceil(data.length / perPage))
  return {
    data: data.slice((number - 1) * perPage, number * perPage),
    meta: { total: data.length, current_page: number, last_page: last, per_page: perPage },
    links: { prev: number > 1 ? '?page=1' : null, next: number < last ? `?page=${number + 1}` : null },
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => { resolve = yes })
  return { promise, resolve }
}
async function settle() {
  for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() }
}
async function mount(path = '/dashboard') {
  router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/dashboard', component: DocumentsView },
    { path: '/documents', component: DocumentsView },
    { path: '/documents/:guid', component: { render: () => null } },
    { path: '/documents/:guid/edit', component: { render: () => null } },
  ] })
  await router.push(path)
  const pinia = createPinia()
  useAuthStore(pinia).user = { guid: 'owner', name: 'Owner', email: 'owner@example.test', email_verified: true }
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({ render: () => h(RouterView) })
  app.use(pinia).use(router).mount(host)
  await settle()
}
function text(element: HTMLElement) {
  const copy = element.cloneNode(true) as HTMLElement
  copy.querySelectorAll('[aria-hidden=true]').forEach((item) => item.remove())
  return copy.textContent?.trim() ?? ''
}
function button(label: string) {
  const result = [...host.querySelectorAll('button')].find((item) => text(item) === label)
  if (!result) throw new Error(`Missing button: ${label}`)
  return result
}
function stat(label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('[aria-label="Ringkasan dokumen"] button')]
    .find((item) => text(item).startsWith(label))!
}
function titles() { return [...host.querySelectorAll('article a[title]')].map((item) => item.textContent) }
function filterMenu() { return host.querySelector<HTMLDivElement>('div:has(>button[aria-controls="dashboard-filters"])')! }
function filterTrigger() { return filterMenu().querySelector<HTMLButtonElement>('button[aria-controls="dashboard-filters"]')! }
async function openFilters() {
  filterTrigger().click()
  await settle()
  expect(filterTrigger().getAttribute('aria-expanded')).toBe('true')
}
async function select(label: string, option: string) {
  host.querySelector<HTMLElement>(`[role=combobox][aria-label="${label}"]`)!.click()
  await settle()
  const list = host.querySelector(`[role=listbox][aria-label="${label}"]`)
  const choice = [...list!.querySelectorAll<HTMLElement>('[role=option]')].find((item) => item.textContent?.trim() === option)
  if (!choice) throw new Error(`Missing option: ${option}`)
  choice.click()
  await settle()
}
function search(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[type=search]')!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  setWorkspaceLanguage('id')
  documents = [record('zeta', 'Zeta'), record('alpha', 'Alpha', 'completed'), record('beta', 'Beta', 'in_progress'), record('final', 'Final', 'finalizing'), record('hidden', 'Tersembunyi', 'draft', true)]
  api.list.mockImplementation(async (filters) => {
    const rows = documents.filter((document) =>
      document.is_hidden === (filters.visibility === 'hidden') &&
      (!filters.status || document.status === filters.status) &&
      (!filters.q || document.title.toLowerCase().includes(filters.q.toLowerCase())) &&
      (!filters.categoryGuid || document.category_guid === filters.categoryGuid) &&
      (!filters.uncategorized || !document.category_guid),
    )
    return page(rows, filters.page, filters.perPage)
  })
  api.count.mockImplementation(async (status, visibility) => {
    const rows = documents.filter((document) => document.is_hidden === (visibility === 'hidden') && (!status || document.status === status))
    return page(rows, 1, 1)
  })
  api.categories.mockResolvedValue([category])
  api.create.mockResolvedValue({ guid: 'new-document' })
  api.setVisibility.mockImplementation(async (guid, hidden) => { documents.find((item) => item.guid === guid)!.is_hidden = hidden })
  api.pdf.mockResolvedValue({ data: new Uint8Array([1, 2, 3]), hash: 'pdf' })
  api.bulkAssignCategory.mockResolvedValue({ updated_count: 1, category_guid: category.guid })
  feedback.confirmAction.mockResolvedValue(true)
  if (!HTMLElement.prototype.showPopover) HTMLElement.prototype.showPopover = function () {}
  if (!HTMLElement.prototype.hidePopover) HTMLElement.prototype.hidePopover = function () {}
})
afterEach(() => {
  app?.unmount(); app = undefined
  host?.remove()
  setWorkspaceActive(false)
  setWorkspaceLanguage('id')
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('dashboard workspace', () => {
  it('keeps card selections out of the dashboard URL', async () => {
    await mount('/dashboard?keep=original')
    stat('Draft').click(); await settle()
    expect(router.currentRoute.value.fullPath).toBe('/dashboard?keep=original')
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'draft' }))
    expect(stat('Draft').getAttribute('aria-pressed')).toBe('true')
  })

  it('removes legacy dashboard filter parameters on entry without retaining them as selected state', async () => {
    await mount('/dashboard?status=draft&q=old&visibility=hidden&category_guid=category-1&uncategorized=1&page=2&per_page=25&keep=original')
    expect(router.currentRoute.value.fullPath).toBe('/dashboard?keep=original')
    expect(api.list).toHaveBeenCalledOnce()
    expect(api.list).toHaveBeenLastCalledWith({ page: 1, status: '', visibility: 'active', perPage: 10, q: '', categoryGuid: '', uncategorized: false })
    expect(stat('Total Dokumen').getAttribute('aria-pressed')).toBe('true')
  })

  it('does not overwrite local filters when unrelated dashboard query parameters change', async () => {
    await mount('/dashboard?keep=original')
    stat('Draft').click(); await settle()
    const calls = api.list.mock.calls.length
    await router.replace('/dashboard?keep=updated'); await settle()
    expect(api.list).toHaveBeenCalledTimes(calls)
    expect(stat('Draft').getAttribute('aria-pressed')).toBe('true')
    expect(titles()).toEqual(['Zeta'])
  })
  it('uses server totals rather than the current page and removes the old footer and status tabs', async () => {
    api.list.mockResolvedValue(page([documents[0]!]))
    const totals: Record<string, number> = { '': 67, draft: 44, in_progress: 12, completed: 9 }
    api.count.mockImplementation(async (status) => ({ ...page([]), meta: { total: totals[status] } }))
    await mount()
    expect(host.querySelector('h1')?.textContent).toBe('Dashboard')
    expect(host.textContent).toContain('Kelola dan pantau aktivitas dokumen Anda.')
    expect(stat('Total Dokumen').querySelector('strong')?.textContent).toBe('67')
    expect(stat('Draft').querySelector('strong')?.textContent).toBe('44')
    expect(stat('Dalam Proses').querySelector('strong')?.textContent).toBe('12')
    expect(stat('Selesai').querySelector('strong')?.textContent).toBe('9')
    expect(api.count).toHaveBeenCalledTimes(4)
    expect(api.count).toHaveBeenCalledWith('', 'active')
    expect(titles()).toEqual(['Zeta'])
    expect(host.querySelector('section:not([aria-label]) h2')?.textContent).toBe('Dokumen terbaru')
    expect(host.textContent).not.toContain('Dokumen milik akun aktif')
    expect(host.textContent).not.toContain('Buka Dokumen Saya')
    expect(host.querySelector('[role=group][aria-label="Filter dokumen"] button[aria-pressed]')).toBeNull()
  })

  it('filters by statistics cards while preserving finalizing as a separate status in the popover', async () => {
    await mount()
    stat('Draft').click(); await settle()
    expect(router.currentRoute.value.query).toEqual({})
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'draft' }))
    expect(titles()).toEqual(['Zeta'])
    expect(stat('Draft').getAttribute('aria-pressed')).toBe('true')
    await openFilters()
    await select('Status', 'Finalisasi')
    expect(router.currentRoute.value.query).toEqual({})
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'finalizing' }))
    expect(titles()).toEqual(['Final'])
    stat('Total Dokumen').click(); await settle()
    expect(router.currentRoute.value.query.status).toBeUndefined()
    expect(titles()).toHaveLength(4)
  })

  it('keeps visibility and category selections locally, including uncategorized, and scopes totals by visibility', async () => {
    await mount('/dashboard?keep=original')
    await openFilters()
    await select('Visibilitas', 'Disembunyikan')
    await select('Status', 'Draft')
    await select('Kategori', 'Perjanjian')
    expect(router.currentRoute.value.query).toEqual({ keep: 'original' })
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ visibility: 'hidden', status: 'draft', categoryGuid: category.guid, page: 1 }))
    expect(api.count).toHaveBeenCalledWith('', 'hidden')
    expect(host.querySelector('[role=combobox][aria-label=Kategori]')?.textContent).toContain('Perjanjian')
    await select('Kategori', 'Tanpa kategori')
    expect(router.currentRoute.value.query.category_guid).toBeUndefined()
    expect(router.currentRoute.value.query.uncategorized).toBeUndefined()
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ uncategorized: true, categoryGuid: '' }))
  })

  it('debounces local search for 400 ms and resets page without changing the URL', async () => {
    documents = Array.from({ length: 21 }, (_, index) => record(`doc-${index}`, `Dokumen ${index}`))
    await mount('/dashboard?keep=original')
    host.querySelector<HTMLButtonElement>('[aria-label=Berikutnya]')!.click(); await settle()
    const initialCalls = api.list.mock.calls.length
    search('  Dokumen 1  ')
    await vi.advanceTimersByTimeAsync(399); await settle()
    expect(api.list).toHaveBeenCalledTimes(initialCalls)
    await vi.advanceTimersByTimeAsync(1); await settle()
    expect(router.currentRoute.value.query).toEqual({ keep: 'original' })
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: 'Dokumen 1', page: 1, perPage: 10 }))
  })

  it('retains page-local title sorting without making an unsupported server sort request', async () => {
    await mount()
    const calls = api.list.mock.calls.length
    expect(titles()).toEqual(['Zeta', 'Alpha', 'Beta', 'Final'])
    await select('Urutkan', 'Judul A–Z pada halaman ini')
    expect(titles()).toEqual(['Alpha', 'Beta', 'Final', 'Zeta'])
    expect(api.list).toHaveBeenCalledTimes(calls)
    expect(host.textContent).toContain('Urutan judul hanya berlaku pada halaman yang sedang dibuka.')
  })

  it('cancels a pending search debounce when resetting filters', async () => {
    await mount('/dashboard?keep=original')
    await select('Tampilkan baris', '25')
    stat('Draft').click(); await settle()
    search('queued search')
    await openFilters()
    button('Reset filter').click(); await settle()
    await vi.advanceTimersByTimeAsync(400); await settle()
    expect(router.currentRoute.value.query).toEqual({ keep: 'original' })
    expect(host.querySelector<HTMLInputElement>('input[type=search]')?.value).toBe('')
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ q: '', status: '', page: 1, perPage: 25 }))
  })

  it('opens the same existing creation dialog from the header and the true-empty CTA', async () => {
    documents = []
    await mount()
    expect(host.querySelector('h3')?.textContent).toBe('Belum ada dokumen')
    expect(host.textContent).toContain('Mulai dengan membuat dokumen pertama Anda.')
    expect(host.querySelector('nav[aria-label="Halaman dokumen"]')).toBeNull()
    expect(host.querySelectorAll('.draft-dialog')).toHaveLength(1)
    const buttons = [...host.querySelectorAll('button')].filter((item) => text(item) === '+ Buat Dokumen')
    expect(buttons).toHaveLength(2)
    buttons[0]!.click(); await settle()
    const dialog = host.querySelector<HTMLDialogElement>('.draft-dialog')!
    expect(dialog.open).toBe(true)
    const input = dialog.querySelector<HTMLInputElement>('#document-title')!
    input.value = 'Perjanjian baru'; input.dispatchEvent(new Event('input', { bubbles: true })); await settle()
    button('Batal').click(); await settle()
    buttons[1]!.click(); await settle()
    expect(host.querySelector('.draft-dialog')).toBe(dialog)
    expect(dialog.open).toBe(true)
    expect(input.value).toBe('Perjanjian baru')
    dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await settle()
    expect(feedback.confirmAction).toHaveBeenCalledWith('Buat draft “Perjanjian baru”?', expect.any(Object))
    expect(api.create).toHaveBeenCalledWith('Perjanjian baru')
    expect(router.currentRoute.value.path).toBe('/documents/new-document/edit')
  })

  it.each(['search', 'status', 'visibility', 'category', 'uncategorized'])('distinguishes filtered empty results for local %s and resets all filters', async (filter) => {
    api.list.mockResolvedValue(page([]))
    await mount('/dashboard?keep=original')
    if (filter === 'search') {
      search('missing'); await vi.advanceTimersByTimeAsync(400); await settle()
    } else {
      await openFilters()
      if (filter === 'status') await select('Status', 'Selesai')
      else if (filter === 'visibility') await select('Visibilitas', 'Disembunyikan')
      else await select('Kategori', filter === 'category' ? 'Perjanjian' : 'Tanpa kategori')
    }
    expect(host.querySelector('h3')?.textContent).toBe('Tidak ada dokumen yang cocok')
    expect(host.textContent).toContain('Coba ubah kata kunci atau filter pencarian.')
    expect([...host.querySelectorAll('button')].filter((item) => text(item) === '+ Buat Dokumen')).toHaveLength(1)
    const reset = [...host.querySelectorAll('button')].filter((item) => text(item) === 'Reset filter').at(-1)!
    reset.click(); await settle()
    expect(router.currentRoute.value.query).toEqual({ keep: 'original' })
    expect(api.list).toHaveBeenLastCalledWith({ page: 1, status: '', visibility: 'active', perPage: 10, q: '', categoryGuid: '', uncategorized: false })
    expect(host.querySelector('h3')?.textContent).toBe('Belum ada dokumen')
  })

  it('does not flash empty results during loading and ignores a stale list response', async () => {
    const first = deferred<Page<DocumentRecord>>()
    api.list.mockReturnValueOnce(first.promise)
    await mount()
    expect(host.textContent).toContain('Memuat dokumen…')
    expect(host.querySelector('h3')).toBeNull()
    search('Alpha'); await vi.advanceTimersByTimeAsync(400); await settle()
    expect(titles()).toEqual(['Alpha'])
    first.resolve(page([])); await settle()
    expect(titles()).toEqual(['Alpha'])
    expect(host.querySelector('h3')).toBeNull()
  })

  it('shows a separate list error with retry, never an empty state or raw exception', async () => {
    api.list.mockRejectedValueOnce(new AxiosError('private server details'))
    await mount()
    expect(host.textContent).toContain('Hasil permintaan belum dapat dipastikan.')
    expect(host.textContent).not.toContain('private server details')
    expect(host.querySelector('h3')).toBeNull()
    button('Coba lagi').click(); await settle()
    expect(titles()).toHaveLength(4)
  })

  it('shows unavailable totals and retries rather than inventing zero counts', async () => {
    api.count.mockRejectedValueOnce(new Error('unavailable'))
    await mount()
    expect(stat('Total Dokumen').textContent).toContain('Belum tersedia')
    expect(stat('Total Dokumen').querySelector('strong')).toBeNull()
    button('Muat ulang statistik').click(); await settle()
    expect(stat('Total Dokumen').querySelector('strong')?.textContent).toBe('4')
  })

  it('retains backend pagination and row counts with next/previous and page size changes', async () => {
    documents = Array.from({ length: 31 }, (_, index) => record(`doc-${index}`, `Dokumen ${index}`))
    await mount()
    expect(host.textContent).toContain('Menampilkan 1–10 dari 31')
    expect(host.querySelector<HTMLButtonElement>('[aria-label=Sebelumnya]')?.disabled).toBe(true)
    host.querySelector<HTMLButtonElement>('[aria-label=Berikutnya]')!.click(); await settle()
    expect(router.currentRoute.value.query).toEqual({})
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, perPage: 10 }))
    expect(host.textContent).toContain('Menampilkan 11–20 dari 31')
    await select('Tampilkan baris', '25')
    expect(router.currentRoute.value.query).toEqual({})
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, perPage: 25 }))
    expect(host.textContent).toContain('Menampilkan 1–25 dari 31')
  })

  it('returns to the last available local page after hiding its final document', async () => {
    documents = Array.from({ length: 11 }, (_, index) => record(`doc-${index}`, `Dokumen ${index}`))
    await mount()
    host.querySelector<HTMLButtonElement>('[aria-label=Berikutnya]')!.click(); await settle()
    expect(titles()).toEqual(['Dokumen 10'])
    host.querySelector<HTMLButtonElement>('[aria-label="Buka tindakan dokumen Dokumen 10"]')!.click(); await settle()
    button('Sembunyikan').click(); await settle()
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }))
    expect(titles()).toHaveLength(10)
    expect(host.textContent).toContain('Menampilkan 1–10 dari 10')
    expect(router.currentRoute.value.fullPath).toBe('/dashboard')
  })

  it('preserves document links, owner actions, visibility confirmation, PDF download and bulk category assignment', async () => {
    await mount()
    host.querySelector<HTMLButtonElement>('[aria-label="Buka tindakan dokumen Zeta"]')!.click(); await settle()
    expect(host.querySelector('#document-actions-zeta a')?.getAttribute('href')).toBe('/documents/zeta/edit')
    expect(host.querySelector('article a[title=Zeta]')?.getAttribute('href')).toBe('/documents/zeta')
    button('Sembunyikan').click(); await settle()
    expect(feedback.confirmAction).toHaveBeenCalledWith('Dokumen disembunyikan dari daftar Anda. Penerima tetap dapat mengaksesnya.', expect.any(Object))
    expect(api.setVisibility).toHaveBeenCalledWith('zeta', true)
    expect(titles()).not.toContain('Zeta')
    await openFilters(); await select('Visibilitas', 'Disembunyikan')
    host.querySelector<HTMLButtonElement>('[aria-label="Buka tindakan dokumen Zeta"]')!.click(); await settle()
    button('Kembalikan ke daftar aktif').click(); await settle()
    expect(api.setVisibility).toHaveBeenCalledWith('zeta', false)
    await select('Visibilitas', 'Dokumen aktif')
    const pdfUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download')
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    host.querySelector<HTMLButtonElement>('[aria-label="Buka tindakan dokumen Alpha"]')!.click(); await settle()
    button('Unduh PDF').click(); await settle()
    expect(api.pdf).toHaveBeenCalledWith('version-alpha')
    expect(pdfUrl).toHaveBeenCalled()
    const checkbox = host.querySelector<HTMLInputElement>('[aria-label="Pilih dokumen Zeta"]')!
    checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true })); await settle()
    await select('Tetapkan kategori', 'Perjanjian')
    button('Terapkan').click(); await settle()
    expect(api.bulkAssignCategory).toHaveBeenCalledWith(['zeta'], category.guid)
  })

  it('closes the filter popover with Escape or an outside pointer, preserving selected values', async () => {
    await mount()
    stat('Draft').click(); await settle()
    await openFilters()
    filterMenu().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await settle()
    expect(filterTrigger().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(filterTrigger())
    await openFilters()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await settle()
    expect(filterTrigger().getAttribute('aria-expanded')).toBe('false')
    expect(router.currentRoute.value.query).toEqual({})
    expect(stat('Draft').getAttribute('aria-pressed')).toBe('true')
  })

  it('toggles the filter dropdown from its trigger and keeps selections across reopening without extra requests', async () => {
    await mount()
    expect(filterTrigger().getAttribute('aria-expanded')).toBe('false')
    await openFilters()
    await select('Kategori', 'Perjanjian')
    const calls = api.list.mock.calls.length
    filterMenu().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); await settle()
    expect(filterTrigger().getAttribute('aria-expanded')).toBe('true')
    filterTrigger().click(); await settle()
    expect(filterTrigger().getAttribute('aria-expanded')).toBe('false')
    await vi.advanceTimersByTimeAsync(200); await settle()
    expect(host.querySelector('#dashboard-filters')).toBeNull()
    await openFilters()
    expect(host.querySelector('[role=combobox][aria-label="Kategori"]')?.textContent).toContain('Perjanjian')
    expect(titles()).toEqual(['Alpha'])
    expect(api.list).toHaveBeenCalledTimes(calls)
  })

  it('keeps the Documents route presentation and creation flow unchanged', async () => {
    await mount('/documents?status=draft')
    expect(host.querySelector('h1')?.textContent).toBe('Dokumen Saya')
    expect(host.querySelector('[aria-label="Ringkasan dokumen"]')).toBeNull()
    expect(host.querySelector('button[aria-controls="dashboard-filters"]')).toBeNull()
    expect(host.querySelector('[role=combobox][aria-label=Visibilitas]')).not.toBeNull()
    expect(host.querySelector('[role=combobox][aria-label=Status]')).not.toBeNull()
    await select('Status', 'Selesai')
    expect(router.currentRoute.value.query).toEqual({ status: 'completed' })
    expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed' }))
    button('+ Buat dokumen').click(); await settle()
    expect(host.querySelector<HTMLDialogElement>('.draft-dialog')?.open).toBe(true)
    expect(api.count).not.toHaveBeenCalled()
  })

  it('does not carry state between the Documents route and a new dashboard visit', async () => {
    await mount()
    stat('Draft').click(); await settle()
    await router.push('/documents?status=completed'); await settle()
    expect(titles()).toEqual(['Alpha'])
    expect(router.currentRoute.value.query).toEqual({ status: 'completed' })
    await router.push('/dashboard'); await settle()
    expect(stat('Total Dokumen').getAttribute('aria-pressed')).toBe('true')
    expect(titles()).toHaveLength(4)
    expect(router.currentRoute.value.fullPath).toBe('/dashboard')
  })

  it('translates new dashboard labels using the existing language service', async () => {
    documents = []
    await mount()
    setWorkspaceLanguage('en'); setWorkspaceActive(true); await settle()
    expect(host.textContent).toContain('Manage and track your document activity.')
    expect(host.textContent).toContain('Total documents')
    expect(host.textContent).toContain('No documents yet')
    expect(host.textContent).toContain('Start by creating your first document.')
  })
})

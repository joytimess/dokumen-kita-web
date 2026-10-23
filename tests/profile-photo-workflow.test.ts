// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import ProfileView from '../src/views/workspace/ProfileView.vue'
import { useAuthStore } from '../src/stores/auth'
import { language } from '../src/services/workspace-language'

const mocks = vi.hoisted(() => ({ upload: vi.fn(), destroy: vi.fn(), options: {} as { ready?: () => void }, export: vi.fn() }))
vi.mock('../src/services/http', () => ({ authMode: 'api' }))
vi.mock('../src/services/account.service', () => ({ accountApi: { uploadPhoto: mocks.upload } }))
vi.mock('../src/utils/profilePhoto', async (original) => ({ ...await original<typeof import('../src/utils/profilePhoto')>(), exportProfilePhoto: mocks.export }))
vi.mock('cropperjs', () => ({ default: class {
  constructor(_image: unknown, options: typeof mocks.options) { mocks.options = options }
  getCanvasData() { return { width: 200, naturalWidth: 1000, naturalHeight: 2000 } }
  getCropBoxData() { return { width: 200, height: 200 } }
  destroy = mocks.destroy
} }))
let app: App | undefined
let host: HTMLDivElement
async function settle() { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
afterEach(() => { app?.unmount(); host?.remove(); vi.restoreAllMocks(); vi.clearAllMocks() })
async function setup() {
  language.value = 'id'
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setUser({ guid: 'user', name: 'User', email: 'user@example.test', photo_url: null, capabilities: { can_change_photo: true } } as NonNullable<typeof auth.user>)
  host = document.createElement('div'); document.body.append(host)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:crop')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  app = createApp(ProfileView); app.use(pinia); app.mount(host); await settle()
  const input = host.querySelector<HTMLInputElement>('#profile-photo')!
  async function select(file: File) {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    input.dispatchEvent(new Event('change')); await settle()
  }
  async function ready() {
    host.querySelector('.crop-stage img')!.dispatchEvent(new Event('load'))
    mocks.options.ready!(); await settle()
  }
  function button(label: string) { return Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)! }
  return { auth, input, select, ready, button }
}

it('rejects invalid and oversized input before opening a crop or uploading', async () => {
  const { select } = await setup()
  await select(new File(['bad'], 'bad.gif', { type: 'image/gif' }))
  expect(host.querySelector('dialog')).toBeNull()
  await select(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }))
  expect(host.querySelector('dialog')).toBeNull(); expect(mocks.upload).not.toHaveBeenCalled()
})
it('cancels without upload, releases the URL, and permits choosing the same file again', async () => {
  const { select, button, input } = await setup()
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })
  await select(file); expect(host.querySelector('dialog')).toBeTruthy(); expect(input.value).toBe('')
  button('Batal').click(); await settle()
  expect(host.querySelector('dialog')).toBeNull(); expect(mocks.upload).not.toHaveBeenCalled()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:crop')
  await select(file); expect(host.querySelector('dialog')).toBeTruthy()
})
it('retains the crop on upload failure, blocks close/duplicate submit during upload, then retries and updates the shared user', async () => {
  const { auth, select, ready, button } = await setup()
  const oldUser = auth.user
  await select(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })); await ready()
  mocks.export.mockResolvedValue(new File(['crop'], 'profile-photo.jpg', { type: 'image/jpeg' }))
  let reject!: (error: Error) => void
  mocks.upload.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  button('Simpan foto').click(); await settle()
  expect(button('Batal').disabled).toBe(true)
  host.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })); await settle()
  expect(host.querySelector('dialog')).toBeTruthy()
  reject(new Error('Network failure')); await settle()
  expect(auth.user).toBe(oldUser); expect(host.querySelector('dialog')).toBeTruthy(); expect(mocks.destroy).not.toHaveBeenCalled()
  mocks.upload.mockResolvedValueOnce({ ...oldUser, photo_url: 'https://example.test/new.jpg' })
  button('Simpan foto').click(); await settle()
  expect(mocks.upload).toHaveBeenCalledTimes(2)
  expect(auth.user?.photo_url).toBe('https://example.test/new.jpg')
  expect(host.querySelector('dialog')).toBeNull()
  expect(host.querySelector('img')?.getAttribute('src')).toBe('https://example.test/new.jpg')
  expect(mocks.destroy).toHaveBeenCalledTimes(1)
})
it('shows a decode failure and leaves cancellation available', async () => {
  const { select, button } = await setup()
  await select(new File(['broken'], 'broken.jpg', { type: 'image/jpeg' }))
  host.querySelector('.crop-stage img')!.dispatchEvent(new Event('error')); await settle()
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Berkas bukan gambar')
  expect(button('Simpan foto').disabled).toBe(true); expect(button('Batal').disabled).toBe(false)
})

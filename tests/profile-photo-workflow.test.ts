// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { AxiosError } from 'axios'
import type { User } from '../src/types/auth'
import InteractionHost from '../src/components/ui/InteractionHost.vue'
import { confirmation, finishConfirmation, notice, notify } from '../src/services/feedback'
import { createPinia, setActivePinia } from 'pinia'
import ProfileView from '../src/views/workspace/ProfileView.vue'
import { useAuthStore } from '../src/stores/auth'
import { language } from '../src/services/workspace-language'

const mocks = vi.hoisted(() => ({ upload: vi.fn(), updateName: vi.fn(), deletePhoto: vi.fn(), requestEmailChange: vi.fn(), changePassword: vi.fn(), destroy: vi.fn(), options: {} as { ready?: () => void }, export: vi.fn() }))
vi.mock('../src/services/http', () => ({ authMode: 'api' }))
vi.mock('../src/services/account.service', () => ({ accountApi: { uploadPhoto: mocks.upload, updateName: mocks.updateName, deletePhoto: mocks.deletePhoto, requestEmailChange: mocks.requestEmailChange, changePassword: mocks.changePassword } }))
vi.mock('../src/utils/profilePhoto', async (original) => ({ ...await original<typeof import('../src/utils/profilePhoto')>(), exportProfilePhoto: mocks.export }))
vi.mock('cropperjs', () => ({ default: class {
  constructor(_image: unknown, options: typeof mocks.options) { mocks.options = options }
  getCanvasData() { return { width: 200, naturalWidth: 1000, naturalHeight: 2000 } }
  getCropBoxData() { return { width: 200, height: 200 } }
  destroy = mocks.destroy
} }))
let app: App | undefined
let host: HTMLDivElement
let feedbackApp: App | undefined
async function settle() { for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick() } }
afterEach(() => { feedbackApp?.unmount(); feedbackApp = undefined; app?.unmount(); host?.remove(); finishConfirmation(false); notify.dismiss(); vi.restoreAllMocks(); vi.clearAllMocks() })
async function setup(overrides: Partial<User> = {}, withFeedback = false) {
  language.value = 'id'
  const pinia = createPinia(); setActivePinia(pinia)
  const auth = useAuthStore()
  auth.setUser({ guid: 'user', name: 'User', email: 'user@example.test', photo_url: null, capabilities: { can_change_photo: true }, ...overrides } as NonNullable<typeof auth.user>)
  host = document.createElement('div'); document.body.append(host)
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:crop')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  app = createApp(ProfileView); app.use(pinia); app.mount(host); await settle()
  if (withFeedback) {
    const feedbackRoot = document.createElement('div'); host.append(feedbackRoot)
    feedbackApp = createApp(InteractionHost); feedbackApp.mount(feedbackRoot)
  }
  const input = host.querySelector<HTMLInputElement>('#profile-photo')!
  async function select(file: File) {
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    input.dispatchEvent(new Event('change')); await settle()
  }
  async function ready() {
    host.querySelector('.crop-stage img')!.dispatchEvent(new Event('load'))
    mocks.options.ready!(); await settle()
  }
  function button(label: string) {
    return Array.from(host.querySelectorAll('button')).find((button) => {
      if (button.getAttribute('aria-label') === label) return true
      const copy = button.cloneNode(true) as HTMLButtonElement
      copy.querySelectorAll('[aria-hidden=true]').forEach((icon) => icon.remove())
      return copy.textContent?.trim() === label
    })!
  }
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
  expect(host.querySelector('dialog')?.textContent).toContain('photo.jpg')
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

it('keeps Google email read-only and enables saving only a changed nonempty name', async () => {
  const { auth, button } = await setup()
  auth.setUser({ ...auth.user!, login_methods: ['google'], capabilities: {
    can_change_photo: true, can_change_name: true, can_change_email: false, can_change_password: false,
  } })
  await settle()
  expect(host.querySelector('#profile-email-title')?.closest('section')?.textContent).toContain('Email akun ini dikelola melalui Google')
  expect(host.querySelector('#new-account-email')).toBeNull()
  expect(host.querySelector('#password-new')).toBeNull()
  expect(button('Simpan perubahan').disabled).toBe(true)
  const field = host.querySelector<HTMLInputElement>('#profile-name')!
  field.value = 'Nama baru'; field.dispatchEvent(new Event('input')); await settle()
  expect(button('Simpan perubahan').disabled).toBe(false)
  field.value = '   '; field.dispatchEvent(new Event('input')); await settle()
  expect(button('Simpan perubahan').disabled).toBe(true)
})

it('preserves email and password forms when backend capabilities allow them', async () => {
  const { auth } = await setup()
  auth.setUser({ ...auth.user!, login_methods: ['email_password'], capabilities: {
    can_change_photo: true, can_change_name: true, can_change_email: true, can_change_password: true,
  } })
  await settle()
  expect(host.querySelector('#new-account-email')).not.toBeNull()
  expect(host.querySelector('#password-new')).not.toBeNull()
})

const localAccount: Partial<User> = {
  login_methods: ['email_password'], email_verified: true,
  capabilities: { can_change_photo: true, can_change_name: true, can_change_email: true, can_change_password: true },
}
function fill(id: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`#${id}`)!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
function submit(id: string) {
  host.querySelector(`#${id}`)!.dispatchEvent(new Event('submit', { cancelable: true }))
}
function validationError(fields: Record<string, string[]>) {
  return new AxiosError('Validation failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 422, data: { error: { errors: fields } },
  } as NonNullable<AxiosError['response']>)
}

it('shows actual identity, reliable verification status, and triggers the single hidden photo input', async () => {
  const longName = 'NamaPanjang'.repeat(20)
  const longEmail = `${'alamat'.repeat(30)}@example.test`
  const { auth, input, button } = await setup({ ...localAccount, name: longName, email: longEmail })
  expect(host.querySelector('#profile-identity-title')?.textContent).toBe(longName)
  expect(host.querySelector('#profile-identity-title')?.parentElement?.textContent).toContain(longEmail)
  expect(host.querySelector('#profile-identity-title')?.parentElement?.textContent).toContain('Terverifikasi')
  expect(input.classList.contains('hidden')).toBe(true)
  const picker = vi.spyOn(input, 'click').mockImplementation(() => {})
  button('Ubah foto').click()
  expect(picker).toHaveBeenCalledTimes(1)
  expect(host.querySelectorAll('input[type=file]')).toHaveLength(1)
  auth.setUser({ ...auth.user!, email_verified: false }); await settle()
  expect(host.querySelector('#profile-identity-title')?.parentElement?.textContent).toContain('Belum diverifikasi')
})

it('keeps name validation, pending state, success notification and shared identity updates', async () => {
  const { auth, button } = await setup(localAccount)
  fill('profile-name', 'Nama baru'); await settle()
  let reject!: (error: unknown) => void
  mocks.updateName.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  host.querySelector('.profile-name-form')!.dispatchEvent(new Event('submit', { cancelable: true }))
  await settle()
  expect(host.querySelector<HTMLInputElement>('#profile-name')!.disabled).toBe(true)
  expect(mocks.updateName).toHaveBeenCalledWith('Nama baru')
  reject(validationError({ name: ['Nama tidak valid.'] })); await settle()
  expect(host.querySelector('#profile-name-error')?.textContent).toBe('Nama tidak valid.')
  expect(auth.user?.name).toBe('User')
  mocks.updateName.mockResolvedValueOnce({ ...auth.user!, name: 'Nama baru' })
  button('Simpan perubahan').click(); await settle()
  expect(auth.user?.name).toBe('Nama baru')
  expect(host.querySelector('#profile-identity-title')?.textContent).toBe('Nama baru')
  expect(button('Simpan perubahan').disabled).toBe(true)
  expect(notice.value?.message).toBe('Nama profil berhasil diperbarui.')
})

it('expands existing email form without remounting or losing fields, errors and verification cooldown', async () => {
  const { auth, button } = await setup(localAccount)
  const form = host.querySelector<HTMLFormElement>('#profile-email-form')!
  const input = host.querySelector<HTMLInputElement>('#new-account-email')!
  expect(form.style.display).toBe('none')
  button('Ubah email').click(); await settle()
  fill('new-account-email', 'next@example.test'); await settle()
  mocks.requestEmailChange.mockRejectedValueOnce(validationError({ email: ['Email sudah digunakan.'] }))
  submit('profile-email-form'); await settle()
  expect(host.querySelector('#new-account-email-error')?.textContent).toBe('Email sudah digunakan.')
  button('Tutup pengaturan email').click(); await settle()
  button('Ubah email').click(); await settle()
  expect(host.querySelector('#new-account-email')).toBe(input)
  expect(input.value).toBe('next@example.test')
  expect(host.querySelector('#new-account-email-error')?.textContent).toBe('Email sudah digunakan.')
  let resolve!: (value: { expires_in: number; resend_after: number }) => void
  mocks.requestEmailChange.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  submit('profile-email-form'); await settle()
  expect(button('Tutup pengaturan email').disabled).toBe(true)
  expect(input.disabled).toBe(true)
  submit('profile-email-form'); await settle()
  expect(mocks.requestEmailChange).toHaveBeenCalledTimes(2)
  resolve({ expires_in: 900, resend_after: 60 }); await settle()
  expect(mocks.requestEmailChange).toHaveBeenLastCalledWith('next@example.test')
  expect(auth.user?.email).toBe('user@example.test')
  expect(form.textContent).toContain('Menunggu verifikasi')
  expect(form.textContent).toContain('next@example.test')
  expect(input.disabled).toBe(true)
  button('Tutup pengaturan email').click(); await settle()
  button('Ubah email').click(); await settle()
  expect(form.textContent).toContain('Tunggu 60 detik')
  expect(notice.value?.kind).toBe('success')
  expect(host.querySelector('dialog')).toBeNull()
})

it('retains password fields when collapsed and preserves validation, pending, retry and session messaging', async () => {
  const { auth, button } = await setup(localAccount)
  const form = host.querySelector<HTMLFormElement>('#profile-password-form')!
  const input = host.querySelector<HTMLInputElement>('#password-new')!
  expect(form.closest<HTMLElement>('.password-expand')!.style.display).toBe('none')
  button('Ubah kata sandi').click(); await settle()
  fill('password-new', 'PasswordBaru123!'); fill('password-confirm', 'Mismatch'); await settle()
  host.querySelector<HTMLButtonElement>('[aria-controls=password-new]')!.click(); await settle()
  expect(input.type).toBe('text')
  expect(button('Perbarui kata sandi').disabled).toBe(true)
  submit('profile-password-form'); await settle()
  expect(mocks.changePassword).not.toHaveBeenCalled()
  button('Tutup pengaturan kata sandi').click(); await settle()
  button('Ubah kata sandi').click(); await settle()
  expect(host.querySelector('#password-new')).toBe(input)
  expect(input.value).toBe('PasswordBaru123!')
  expect(input.type).toBe('text')
  fill('password-confirm', 'PasswordBaru123!'); await settle()
  let reject!: (error: unknown) => void
  mocks.changePassword.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
  submit('profile-password-form'); await settle()
  expect(input.disabled).toBe(true)
  expect(button('Tutup pengaturan kata sandi').disabled).toBe(true)
  submit('profile-password-form'); await settle()
  expect(mocks.changePassword).toHaveBeenCalledTimes(1)
  reject(validationError({ password: ['Kata sandi belum memenuhi persyaratan.'] })); await settle()
  expect(host.querySelector('#password-new-error')?.textContent).toBe('Kata sandi belum memenuhi persyaratan.')
  expect(input.value).toBe('PasswordBaru123!')
  mocks.changePassword.mockResolvedValueOnce({ ...auth.user! })
  button('Perbarui kata sandi').click(); await settle()
  expect(mocks.changePassword).toHaveBeenLastCalledWith('PasswordBaru123!', 'PasswordBaru123!')
  expect(input.value).toBe('')
  expect(host.querySelector<HTMLInputElement>('#password-confirm')!.value).toBe('')
  expect(auth.user?.guid).toBe('user')
  expect(form.textContent).toContain('Perangkat ini tetap dapat digunakan.')
  expect(notice.value?.message).toBe('Kata sandi berhasil diperbarui.')
})

it('reuses the shared delete confirmation for cancel, native close, confirm and the original deletion handler', async () => {
  const { auth, button } = await setup({ ...localAccount, photo_url: 'https://example.test/old.jpg' }, true)
  const dialog = host.querySelector<HTMLDialogElement>('.confirmation-dialog')!
  expect(host.querySelector('img')?.getAttribute('src')).toBe('https://example.test/old.jpg')
  button('Hapus foto').click(); await settle()
  expect(dialog.open).toBe(true)
  expect(confirmation.value?.title).toBe('Hapus foto profil')
  expect(host.querySelector('.photo-crop-dialog')).toBeNull()
  button('Batal').click(); await vi.waitFor(() => expect(confirmation.value).toBeNull())
  expect(dialog.open).toBe(false)
  expect(mocks.deletePhoto).not.toHaveBeenCalled()
  button('Hapus foto').click(); await settle()
  dialog.close(); await vi.waitFor(() => expect(confirmation.value).toBeNull())
  expect(mocks.deletePhoto).not.toHaveBeenCalled()
  button('Hapus foto').click(); await settle()
  let resolve!: (value: User) => void
  mocks.deletePhoto.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  button('Hapus').click(); await vi.waitFor(() => expect(mocks.deletePhoto).toHaveBeenCalledTimes(1))
  await settle()
  expect(button('Hapus foto').disabled).toBe(true)
  expect(button('Ubah foto').disabled).toBe(true)
  resolve({ ...auth.user!, photo_url: null }); await settle()
  expect(auth.user?.photo_url).toBeNull()
  expect(host.querySelector('img')).toBeNull()
  expect(host.querySelectorAll('dialog')).toHaveLength(1)
  expect(notice.value?.message).toBe('Foto profil berhasil dihapus.')
})

it('keeps crop Escape cancellation separate from the shared confirmation state', async () => {
  const { select, ready } = await setup(localAccount)
  await select(new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })); await ready()
  const dialog = host.querySelector<HTMLDialogElement>('.photo-crop-dialog')!
  dialog.dispatchEvent(new Event('cancel', { cancelable: true })); await settle()
  expect(host.querySelector('.photo-crop-dialog')).toBeNull()
  expect(confirmation.value).toBeNull()
  expect(mocks.upload).not.toHaveBeenCalled()
  expect(mocks.destroy).toHaveBeenCalledTimes(1)
})

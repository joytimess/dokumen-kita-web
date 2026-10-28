// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref, type App } from 'vue'
import RecoveryOtpInput from '../src/components/auth/RecoveryOtpInput.vue'
import { createPasswordRecovery } from '../src/composables/usePasswordRecovery'

let app: App | undefined
afterEach(() => { app?.unmount(); document.body.replaceChildren() })

it('keeps typing, paste and deletion in one native OTP value', async () => {
  const value = ref('')
  const host = document.createElement('div')
  document.body.append(host)
  app = createApp({ components: { RecoveryOtpInput }, setup: () => ({ value }), template: '<RecoveryOtpInput v-model="value" />' })
  app.mount(host)
  const input = host.querySelector('input')!
  expect(host.querySelectorAll('input')).toHaveLength(1)
  expect(input.autocomplete).toBe('one-time-code')
  expect(input.maxLength).toBe(6)
  input.focus()
  input.value = '12x3'
  input.setSelectionRange(4, 4)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(value.value).toBe('123')
  expect(Array.from(host.querySelectorAll('.recovery-otp-box'), box => box.textContent)).toEqual(['1', '2', '3', '', '', ''])
  input.value = '12'
  input.setSelectionRange(2, 2)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(value.value).toBe('12')
  const paste = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(paste, 'clipboardData', { value: { getData: () => '123456' } })
  input.dispatchEvent(paste)
  await nextTick()
  expect(value.value).toBe('123456')
  expect(input.value).toBe('123456')
  expect(input.selectionStart).toBe(6)
  input.setSelectionRange(2, 2)
  input.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }))
  await nextTick()
  expect(host.querySelectorAll('.recovery-otp-box')[2]?.classList.contains('is-active')).toBe(true)
  input.getBoundingClientRect = () => ({ left: 0, width: 360 } as DOMRect)
  input.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 65 }))
  expect(input.selectionStart).toBe(1)
})

it('submits the six-digit string through the existing verification flow', async () => {
  const verifyOtp = vi.fn().mockResolvedValue({ reset_token: 'token', expires_in: 300 })
  const recovery = createPasswordRecovery({
    forgot: vi.fn().mockResolvedValue({ status: 'accepted', otp_expires_in: 300, resend_after: 60 }),
    verifyOtp,
    resetPassword: vi.fn(),
  }, { storage: () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} }) })
  recovery.fields.email = 'user@example.com'
  await recovery.submit()
  recovery.fields.otp = '012345'
  await recovery.submit()
  expect(verifyOtp).toHaveBeenCalledWith({ email: 'user@example.com', otp: '012345' })
  expect(recovery.stage.value).toBe('password')
  recovery.dispose()
})

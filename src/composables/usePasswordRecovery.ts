import { computed, reactive, ref } from 'vue'
import type { FieldErrors, RecoveryAdapter } from '../types/auth'
import { acceptedMessage, expiredMessage, sessionEndedMessage, normalizeEmail, recoveryKey, validateRecovery, recoveryError, secondsRemaining } from '../utils/recovery'

type Stage = 'email' | 'otp' | 'password' | 'success'
type StorageAccess = () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
export function createPasswordRecovery(api: RecoveryAdapter, options: { storage?: StorageAccess; now?: () => number; onSuccess?: (email: string) => void } = {}) {
  const now = options.now ?? Date.now
  const storage = options.storage ?? (() => window.sessionStorage)
  const stage = ref<Stage>('email')
  const fields = reactive({ email: '', otp: '', password: '', password_confirmation: '' })
  const errors = ref<FieldErrors>({})
  const message = ref('')
  const failed = ref(false)
  const busy = ref(false)
  const clock = ref(now())
  const otpDeadline = ref(0)
  const resendDeadline = ref(0)
  const blockedDeadline = ref(0)
  const otpConsumed = ref(false)
  let token = ''
  let tokenDeadline = 0
  let generation = 0
  let disposed = false
  let interval: ReturnType<typeof setInterval> | undefined
  let visibility: Pick<Document, 'addEventListener' | 'removeEventListener'> | undefined
  const otpRemaining = computed(() => secondsRemaining(otpDeadline.value, clock.value))
  const resendRemaining = computed(() => secondsRemaining(Math.max(resendDeadline.value, blockedDeadline.value), clock.value))
  const blockedRemaining = computed(() => secondsRemaining(blockedDeadline.value, clock.value))
  const canVerify = computed(() => stage.value === 'otp' && !otpConsumed.value && otpRemaining.value > 0 && !busy.value && !blockedRemaining.value)
  function removeMetadata() { try { storage().removeItem(recoveryKey) } catch { /* Storage is optional. */ } }
  function persist() {
    try { storage().setItem(recoveryKey, JSON.stringify({ version: 1, email: normalizeEmail(fields.email), stage: stage.value, otpDeadline: otpDeadline.value, resendDeadline: Math.max(resendDeadline.value, blockedDeadline.value), otpConsumed: otpConsumed.value })) } catch { /* Continue in memory. */ }
  }
  function clearSecrets() { token = ''; tokenDeadline = 0; fields.otp = ''; fields.password = ''; fields.password_confirmation = '' }
  function requireNewCode(text: string) {
    clearSecrets(); otpConsumed.value = true; stage.value = 'otp'; errors.value = {}; message.value = text; failed.value = true; persist()
  }
  function tick() {
    clock.value = now()
    if (stage.value === 'password' && clock.value >= tokenDeadline) requireNewCode(sessionEndedMessage)
  }
  function restore() {
    try {
      const raw = storage().getItem(recoveryKey)
      if (!raw) return
      const data = JSON.parse(raw)
      if (data.version !== 1 || !['otp', 'password'].includes(data.stage) || typeof data.email !== 'string' || Object.keys(validateRecovery('email', data.email, '', '', '')).length || data.email !== normalizeEmail(data.email) || typeof data.otpConsumed !== 'boolean' || !Number.isFinite(data.otpDeadline) || data.otpDeadline < 0 || !Number.isFinite(data.resendDeadline) || data.resendDeadline < 0) throw new Error('Invalid metadata')
      fields.email = data.email; stage.value = 'otp'; otpDeadline.value = data.otpDeadline; resendDeadline.value = data.resendDeadline; otpConsumed.value = data.otpConsumed || data.stage === 'password'
      if (otpConsumed.value) message.value = sessionEndedMessage
      else if (!otpRemaining.value) message.value = expiredMessage
      failed.value = !!message.value
    } catch { removeMetadata() }
  }
  function start(target?: typeof visibility) {
    if (interval || disposed) return
    tick(); interval = setInterval(tick, 1000); visibility = target; visibility?.addEventListener('visibilitychange', tick)
  }
  function dispose() {
    disposed = true; generation++; clearSecrets()
    if (interval) clearInterval(interval)
    interval = undefined; visibility?.removeEventListener('visibilitychange', tick)
  }
  function clear() {
    generation++; clearSecrets(); removeMetadata(); stage.value = 'email'; otpConsumed.value = false; otpDeadline.value = 0; resendDeadline.value = 0; blockedDeadline.value = 0; errors.value = {}; message.value = ''; failed.value = false
  }
  function changeEmail() { if (!busy.value) clear() }
  async function submit(resend = false) {
    tick()
    if (disposed || busy.value || blockedRemaining.value || stage.value === 'success') return
    if (resend && (stage.value !== 'otp' || resendRemaining.value)) return
    if (!resend && stage.value === 'otp' && !canVerify.value) return
    const action = resend ? 'email' : stage.value as 'email' | 'otp' | 'password'
    errors.value = validateRecovery(action, fields.email, fields.otp, fields.password, fields.password_confirmation)
    if (Object.keys(errors.value).length) return
    fields.email = normalizeEmail(fields.email)
    busy.value = true; failed.value = false; message.value = ''
    const requestGeneration = generation
    const started = now()
    try {
      if (action === 'email') {
        const response = await api.forgot(fields.email)
        if (disposed || requestGeneration !== generation) return
        if (response.status !== 'accepted' || !Number.isFinite(response.otp_expires_in) || response.otp_expires_in <= 0 || !Number.isFinite(response.resend_after) || response.resend_after < 0) throw new Error('Invalid response')
        clearSecrets(); otpConsumed.value = false; otpDeadline.value = started + response.otp_expires_in * 1000; resendDeadline.value = started + Math.max(60, response.resend_after) * 1000; stage.value = 'otp'; message.value = acceptedMessage; persist()
      } else if (action === 'otp') {
        const response = await api.verifyOtp({ email: fields.email, otp: fields.otp.trim() })
        if (disposed || requestGeneration !== generation) return
        if (typeof response.reset_token !== 'string' || !response.reset_token || !Number.isFinite(response.expires_in) || response.expires_in <= 0) throw new Error('Invalid response')
        otpConsumed.value = true; persist(); fields.otp = ''; token = response.reset_token; tokenDeadline = started + response.expires_in * 1000; stage.value = 'password'; persist()
      } else {
        const response = await api.resetPassword({ email: fields.email, reset_token: token, password: fields.password, password_confirmation: fields.password_confirmation })
        if (disposed || requestGeneration !== generation) return
        if (response.status !== 'reset') throw new Error('Invalid response')
        options.onSuccess?.(fields.email)
        clear(); fields.email = ''; stage.value = 'success'; message.value = 'Password berhasil diperbarui. Silakan masuk kembali di perangkat Anda.'
        if (interval) clearInterval(interval)
        interval = undefined; visibility?.removeEventListener('visibilitychange', tick)
      }
    } catch (error) {
      if (disposed || requestGeneration !== generation) return
      const feedback = recoveryError(error, action, now())
      errors.value = feedback.fields; message.value = feedback.message; failed.value = true
      if (feedback.blockedUntil) {
        blockedDeadline.value = feedback.blockedUntil
        if (stage.value !== 'email') persist()
      }
      if (feedback.invalidToken) requireNewCode(sessionEndedMessage)
      else if (action === 'otp' && feedback.uncertain) requireNewCode(feedback.message)
    } finally {
      if (!disposed) { busy.value = false; tick() }
    }
  }
  restore()
  return { stage, fields, errors, message, failed, busy, otpConsumed, otpRemaining, resendRemaining, blockedRemaining, canVerify, submit, changeEmail, clear, start, dispose, tick }
}

import { computed, ref, watch } from 'vue'
import axios from 'axios'
import type { User } from '../types/auth'
import { authApi } from '../services/auth.service'
import { retryDeadline, secondsRemaining } from '../utils/recovery'

interface Identity {
  user: User | null
  sessionError: string
  refresh(): Promise<void>
}
export function createEmailVerification(
  auth: Identity,
  options: {
    storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
    now?: () => number
    resend?: () => Promise<unknown>
    onExpired?: () => void
  } = {},
) {
  const now = options.now ?? Date.now
  const clock = ref(now())
  const deadline = ref(0)
  const sending = ref(false)
  const checking = ref(false)
  const message = ref('')
  const failed = ref(false)
  const remaining = computed(() => secondsRemaining(deadline.value, clock.value))
  const key = (guid: string) => `dokumen-kita.email-verification.v1.${guid}`
  function persist(guid: string, value: number) {
    try {
      if (value) options.storage?.setItem(key(guid), String(value))
      else options.storage?.removeItem(key(guid))
    } catch {
      /* Storage is optional, including in private browsing. */
    }
  }
  const stop = watch(
    [() => auth.user?.guid, () => auth.user?.email_verified],
    ([guid, verified]) => {
      deadline.value = 0
      message.value = ''
      if (!guid) return
      if (verified) {
        persist(guid, 0)
        return
      }
      try {
        const stored = Number(options.storage?.getItem(key(guid)))
        if (Number.isFinite(stored) && stored > now()) deadline.value = stored
      } catch {
        /* Continue with an in-memory cooldown. */
      }
      clock.value = now()
    },
    { immediate: true },
  )
  function tick() {
    clock.value = now()
  }
  async function resend() {
    tick()
    if (sending.value || remaining.value || !auth.user || auth.user.email_verified) return
    const guid = auth.user.guid
    sending.value = true
    message.value = ''
    failed.value = false
    try {
      await (options.resend ?? authApi.resendVerification)()
      if (auth.user?.guid !== guid || auth.user.email_verified) return
      deadline.value = now() + 60000
      persist(guid, deadline.value)
      message.value = 'Permintaan kirim ulang diterima. Silakan cek kotak masuk atau folder spam.'
    } catch (error) {
      if (auth.user?.guid !== guid) return
      failed.value = true
      const response = axios.isAxiosError(error) ? error.response : undefined
      if (response?.status === 401) {
        auth.user = null
        persist(guid, 0)
        message.value = 'Sesi berakhir. Masuk kembali untuk melanjutkan verifikasi email.'
        options.onExpired?.()
      } else if (response?.status === 429) {
        deadline.value = retryDeadline(response.headers?.['retry-after'], now())
        persist(guid, deadline.value)
        tick()
        message.value = `Terlalu banyak permintaan. Coba lagi dalam ${remaining.value} detik.`
      } else if (response?.status === 419) {
        message.value =
          'Sesi keamanan berakhir. Muat ulang halaman atau masuk kembali, lalu coba lagi.'
      } else message.value = 'Permintaan belum dapat diproses. Coba lagi.'
    } finally {
      tick()
      sending.value = false
    }
  }
  let lastAutomaticCheck = -Infinity
  async function check(automatic = false) {
    if (checking.value || (automatic && now() - lastAutomaticCheck < 5000)) return
    lastAutomaticCheck = now()
    checking.value = true
    message.value = ''
    failed.value = false
    try {
      await auth.refresh()
      if (auth.sessionError) {
        message.value = auth.sessionError
        failed.value = true
      } else if (!auth.user) options.onExpired?.()
      else if (!auth.user.email_verified && !automatic) {
        message.value = 'Email kamu belum terverifikasi. Klik tautan pada email yang kami kirim.'
      }
    } finally {
      checking.value = false
    }
  }
  return { remaining, sending, checking, message, failed, resend, check, tick, dispose: stop }
}

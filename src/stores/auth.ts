import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'
import { authMode } from '../services/http'
import { authApi } from '../services/auth.service'
import type { User } from '../types/auth'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const restoring = ref(false)
  const sessionError = ref('')
  let identityRequest: Promise<void> | undefined
  let initialized = false
  let sessionVersion = 0
  function setUser(value: User) {
    sessionVersion++
    user.value = value
    sessionError.value = ''
    initialized = true
  }
  function refresh() {
    if (identityRequest) return identityRequest
    if (authMode !== 'api') return Promise.resolve()
    restoring.value = true
    const version = sessionVersion
    identityRequest = (async () => {
      try {
        const currentUser = await authApi.me()
        if (version !== sessionVersion) return
        user.value = currentUser
        sessionError.value = ''
      } catch (error) {
        if (version !== sessionVersion) return
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          user.value = null
          sessionError.value = ''
        } else sessionError.value = 'Status verifikasi belum dapat diperiksa. Coba lagi.'
      } finally {
        restoring.value = false
        initialized = true
        identityRequest = undefined
      }
    })()
    return identityRequest
  }
  function restore() {
    return initialized ? Promise.resolve() : refresh()
  }
  async function logout() {
    if (authMode !== 'api') throw new Error('Logout API belum aktif pada prototype.')
    try {
      await authApi.logout()
    } catch (error) {
      if (!(axios.isAxiosError(error) && error.response?.status === 401)) throw error
    }
    sessionVersion++
    user.value = null
    sessionError.value = ''
  }
  return { user, restoring, sessionError, restore, refresh, setUser, logout }
})

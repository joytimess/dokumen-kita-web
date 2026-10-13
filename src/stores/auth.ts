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
  async function restore() {
    if (authMode !== 'api') return
    restoring.value = true
    try {
      user.value = await authApi.me()
      sessionError.value = ''
    } catch (error) {
      user.value = null
      if (!(axios.isAxiosError(error) && error.response?.status === 401))
        sessionError.value =
          'Sesi belum dapat diperiksa. Periksa koneksi Anda, lalu muat ulang halaman.'
    } finally {
      restoring.value = false
    }
  }
  async function logout() {
    if (authMode !== 'api') throw new Error('Logout API belum aktif pada prototype.')
    try {
      await authApi.logout()
    } catch (error) {
      if (!(axios.isAxiosError(error) && error.response?.status === 401)) throw error
    }
    user.value = null
    sessionError.value = ''
  }
  return { user, restoring, sessionError, restore, logout }
})

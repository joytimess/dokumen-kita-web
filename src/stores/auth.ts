import { defineStore } from 'pinia'
import { onScopeDispose, ref, watch } from 'vue'
import axios from 'axios'
import { authMode } from '../services/http'
import { authApi } from '../services/auth.service'
import { accountApi } from '../services/account.service'
import type { User } from '../types/auth'
import { clearInvitation } from '../utils/invitation'
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const restoring = ref(false)
  const sessionError = ref('')
  const photoSrc = ref('')
  const photoLoaded = ref(false)
  const photoFailed = ref(false)
  let photoKey = ''
  let photoRequest = 0
  let photoObjectUrl = ''
  let identityRequest: Promise<void> | undefined
  let initialized = false
  let sessionVersion = 0
  function releasePhoto() {
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl)
    photoObjectUrl = ''
  }
  async function loadPhoto(force = false) {
    const currentUser = user.value
    const url = currentUser?.photo_url
    const key = JSON.stringify([currentUser?.guid, url])
    if (!force && key === photoKey) return
    photoKey = key
    const request = ++photoRequest
    releasePhoto()
    photoSrc.value = ''
    photoLoaded.value = false
    photoFailed.value = false
    if (!url) return
    try {
      if (new URL(url, window.location.origin).pathname.endsWith('/api/v1/me/photo')) {
        const blob = await accountApi.photo()
        if (request !== photoRequest || user.value?.guid !== currentUser?.guid || user.value?.photo_url !== url) return
        photoObjectUrl = URL.createObjectURL(blob)
        photoSrc.value = photoObjectUrl
      } else photoSrc.value = url
    } catch (cause) {
      if (request !== photoRequest || user.value?.guid !== currentUser?.guid || user.value?.photo_url !== url) return
      photoFailed.value = true
      if (axios.isAxiosError(cause) && cause.response?.status === 401) user.value = null
    }
  }
  watch([() => user.value?.guid, () => user.value?.photo_url], () => { void loadPhoto() }, { immediate: true })
  onScopeDispose(() => { photoRequest++; releasePhoto() })
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
    clearInvitation()
  }
  return { user, restoring, sessionError, photoSrc, photoLoaded, photoFailed, loadPhoto, restore, refresh, setUser, logout }
})

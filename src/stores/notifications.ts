import { defineStore } from 'pinia'
import { onScopeDispose, ref, watch } from 'vue'
import axios from 'axios'
import { useAuthStore } from './auth'
import { notificationsApi } from '../services/notifications.service'
import { notify } from '../services/feedback'
import { workspaceError } from '../services/workspace.errors'
import { formatNumber, t } from '../services/workspace-language'
import type { UserNotification } from '../types/notifications'

export const useNotificationsStore = defineStore('notifications', () => {
  const auth = useAuthStore()
  const notifications = ref<UserNotification[]>([])
  const unreadCount = ref<number>()
  const notificationError = ref('')
  const notificationLoading = ref(false)
  const notificationPage = ref(0)
  const notificationLastPage = ref(1)
  const markingRead = ref(false)
  const centerRequested = ref(false)
  let version = 0
  let listRequest: Promise<boolean> | undefined
  let summaryPending = false
  let summaryDone = false
  let summaryNoticeId: number | undefined

  function reset() {
    version++
    listRequest = undefined
    notifications.value = []
    unreadCount.value = undefined
    notificationError.value = ''
    notificationLoading.value = false
    notificationPage.value = 0
    notificationLastPage.value = 1
    markingRead.value = false
    centerRequested.value = false
    summaryPending = false
    summaryDone = false
    if (summaryNoticeId !== undefined) notify.dismiss(summaryNoticeId)
    summaryNoticeId = undefined
  }
  watch(() => auth.user?.guid, reset, { flush: 'sync' })
  onScopeDispose(reset)

  function loadNotifications(resetPage = false): Promise<boolean> {
    if (!auth.user) return Promise.resolve(false)
    if (listRequest) return listRequest
    if (!resetPage && notificationPage.value >= notificationLastPage.value) return Promise.resolve(true)
    const current = version
    const pageNumber = resetPage ? 1 : notificationPage.value + 1
    notificationLoading.value = true
    notificationError.value = ''
    listRequest = (async () => {
      try {
        const result = await notificationsApi.list(pageNumber)
        if (current !== version) return false
        if (resetPage) notifications.value = result.data
        else {
          const seen = new Set(notifications.value.map((item) => item.guid))
          notifications.value.push(...result.data.filter((item) => !seen.has(item.guid)))
        }
        notificationPage.value = result.meta.current_page
        notificationLastPage.value = result.meta.last_page
        unreadCount.value = result.meta.unread_count
        return true
      } catch (cause) {
        if (current === version) notificationError.value = axios.isAxiosError(cause)
          ? workspaceError(cause).message
          : 'Notifikasi belum dapat dimuat.'
        return false
      } finally {
        if (current === version) {
          notificationLoading.value = false
          listRequest = undefined
        }
      }
    })()
    return listRequest
  }

  function ensureLoaded() {
    return notificationPage.value > 0 ? Promise.resolve(true) : loadNotifications(true)
  }

  function queueLoginSummary() {
    if (auth.user && !summaryDone) summaryPending = true
  }

  async function showLoginSummary(openCenter: () => void) {
    if (!summaryPending || summaryDone || !auth.user) return
    summaryPending = false
    summaryDone = true
    const current = version
    const loaded = await ensureLoaded()
    if (!loaded || current !== version || !unreadCount.value) return
    summaryNoticeId = notify.notification(
      t('Anda memiliki :count notifikasi', { count: formatNumber(unreadCount.value) }),
      'Lihat pembaruan dokumen dan tanda tangan Anda.',
      openCenter,
    )
  }

  async function markRead(item: UserNotification) {
    if (item.read_at || markingRead.value) return true
    const current = version
    markingRead.value = true
    try {
      const result = await notificationsApi.markRead(item.guid)
      if (current !== version) return false
      const existing = notifications.value.find((notification) => notification.guid === item.guid)
      if (existing) existing.read_at = result.data.read_at
      unreadCount.value = result.meta.unread_count
      return true
    } catch (cause) {
      if (current !== version) return false
      if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
      notify.error(t('Notifikasi belum dapat ditandai dibaca.'))
      return false
    } finally {
      if (current === version) markingRead.value = false
    }
  }

  return { notifications, unreadCount, notificationError, notificationLoading, notificationPage, notificationLastPage,
    markingRead, centerRequested, loadNotifications, ensureLoaded, queueLoginSummary, showLoginSummary, markRead }
})

<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import AccountAvatar from '../profile/AccountAvatar.vue'
import { useAuthStore } from '../../stores/auth'
import { notificationsApi } from '../../services/notifications.service'
import { notify } from '../../services/feedback'
import { workspaceError } from '../../services/workspace.errors'
import { dateLabel } from '../../utils/documents'
import { formatNumber, t } from '../../services/workspace-language'
import type { UserNotification } from '../../types/notifications'

const emit = defineEmits<{ toggleSidebar: [] }>()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const beforeLogout = inject<Ref<(() => Promise<boolean>) | null>>('workspaceBeforeLogout')
const root = ref<HTMLElement>()
const menuButton = ref<HTMLButtonElement>()
const activeTrigger = ref<HTMLElement>()
const menu = ref<'notifications' | 'profile' | null>(null)
const notifications = ref<UserNotification[]>([])
const unreadCount = ref<number>()
const notificationError = ref('')
const notificationLoading = ref(false)
const notificationPage = ref(0)
const notificationLastPage = ref(1)
const markingRead = ref(false)
const logoutBusy = ref(false)
const logoutError = ref('')
let requestId = 0

const routeTitle = computed(() => t(String(route.meta.title ?? 'Dokumen Kita')))
watch(() => route.fullPath, () => { menu.value = null })
const initials = computed(() => {
  const words = (auth.user?.name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  return `${words[0]?.[0] ?? ''}${words.length > 1 ? (words.at(-1)?.[0] ?? '') : ''}`.toLocaleUpperCase()
})

function notificationCopy(item: UserNotification) {
  const copies: Record<string, [string, string]> = {
    'assignment.ready': ['Giliran tanda tangan', 'Giliran Anda untuk menandatangani dokumen ini.'],
    'assignment.signed': ['Pembaruan tanda tangan', 'Tanda tangan pada dokumen ini telah tercatat.'],
    'version.revision_requested': ['Permintaan revisi', 'Ada permintaan revisi pada dokumen ini.'],
    'version.rejected': ['Dokumen ditolak', 'Dokumen ini ditolak.'],
    'version.final_pdf_ready': ['PDF final siap', 'PDF final dokumen ini sudah siap.'],
    'version.final_pdf_failed': ['PDF final gagal dibuat', 'PDF final dokumen ini gagal dibuat.'],
  }
  const copy = copies[item.event_type]
  return copy ? { title: t(copy[0]), message: t(copy[1]) } : { title: item.title, message: item.message }
}

async function loadNotifications(reset = false) {
  if (notificationLoading.value || !auth.user) return
  if (!reset && notificationPage.value >= notificationLastPage.value) return
  const identity = auth.user.guid
  const id = ++requestId
  const pageNumber = reset ? 1 : notificationPage.value + 1
  notificationLoading.value = true
  notificationError.value = ''
  try {
    const result = await notificationsApi.list(pageNumber)
    if (id !== requestId || auth.user?.guid !== identity) return
    if (reset) notifications.value = result.data
    else {
      const seen = new Set(notifications.value.map((item) => item.guid))
      notifications.value.push(...result.data.filter((item) => !seen.has(item.guid)))
    }
    notificationPage.value = result.meta.current_page
    notificationLastPage.value = result.meta.last_page
    unreadCount.value = result.meta.unread_count
  } catch (cause) {
    if (id !== requestId || auth.user?.guid !== identity) return
    notificationError.value = axios.isAxiosError(cause)
      ? workspaceError(cause).message
      : 'Notifikasi belum dapat dimuat.'
    if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
  } finally {
    if (id === requestId) notificationLoading.value = false
  }
}

async function openMenu(value: 'notifications' | 'profile', event: MouseEvent) {
  if (menu.value === value) {
    menu.value = null
    return
  }
  activeTrigger.value = event.currentTarget as HTMLElement
  menu.value = value
  logoutError.value = ''
  if (value === 'notifications') await loadNotifications(true)
}

async function markRead(item: UserNotification) {
  if (item.read_at || markingRead.value) return true
  const identity = auth.user?.guid
  markingRead.value = true
  try {
    const result = await notificationsApi.markRead(item.guid)
    if (auth.user?.guid !== identity) return false
    const current = notifications.value.find((notification) => notification.guid === item.guid)
    if (current) current.read_at = result.data.read_at
    unreadCount.value = result.meta.unread_count
    return true
  } catch (cause) {
    if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
    notify.error(t('Notifikasi belum dapat ditandai dibaca.'))
    return false
  } finally {
    markingRead.value = false
  }
}

async function openNotification(item: UserNotification) {
  await markRead(item)
  const guid = item.document_guid
  if (guid && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(guid)) {
    menu.value = null
    await router.push(`/documents/${encodeURIComponent(guid)}`)
  }
}

async function logout() {
  if (logoutBusy.value) return
  if (beforeLogout?.value && !(await beforeLogout.value())) return
  logoutBusy.value = true
  logoutError.value = ''
  try {
    await auth.logout()
    await router.replace('/login')
  } catch {
    logoutError.value = 'Belum dapat keluar. Coba lagi.'
  } finally {
    logoutBusy.value = false
  }
}

function onOutside(event: MouseEvent) {
  if (menu.value && event.target instanceof Node && !root.value?.contains(event.target)) menu.value = null
}
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !menu.value) return
  menu.value = null
  activeTrigger.value?.focus()
}

function focusMenuButton() {
  menuButton.value?.focus()
}
defineExpose({ focusMenuButton })

onMounted(() => {
  void loadNotifications(true)
  document.addEventListener('pointerdown', onOutside)
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  requestId++
  document.removeEventListener('pointerdown', onOutside)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <header class="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-line bg-white px-4 sm:px-7">
    <button
      ref="menuButton"
      type="button"
      class="grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-soft"
      :aria-label="t('Buka menu')"
      aria-controls="workspace-sidebar"
      @click="emit('toggleSidebar')"
    ><span class="material-symbols-outlined" aria-hidden="true">menu</span></button>

    <nav class="flex min-w-0 flex-1 items-center gap-2 text-sm" :aria-label="t('Breadcrumb')">
      <RouterLink to="/dashboard" class="shrink-0 font-semibold text-ink hover:text-primary">Dokumen Kita</RouterLink>
      <span aria-hidden="true" class="shrink-0 text-muted">/</span>
      <span class="min-w-0 truncate text-muted" aria-current="page" :title="routeTitle">{{ routeTitle }}</span>
    </nav>

    <div ref="root" class="relative flex shrink-0 items-center gap-1">
      <button
        type="button"
        class="relative grid size-11 place-items-center rounded-xl text-muted hover:bg-soft"
        :aria-label="unreadCount ? t(':count notifikasi belum dibaca', { count: formatNumber(unreadCount) }) : t('Notifikasi')"
        :aria-expanded="menu === 'notifications'"
        aria-controls="workspace-notifications"
        @click="openMenu('notifications', $event)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
        <span v-if="(unreadCount ?? 0) > 0" class="absolute top-[10px] right-[10px] size-2 rounded-full bg-primary ring-2 ring-white" aria-hidden="true"></span>
      </button>
      <button
        type="button"
        class="flex min-h-11 items-center gap-2 rounded-xl px-1.5 hover:bg-soft sm:px-2"
        :aria-label="t('Profil akun')"
        :aria-expanded="menu === 'profile'"
        aria-controls="workspace-profile"
        @click="openMenu('profile', $event)"
      >
        <AccountAvatar class="size-9 text-sm">
          <span v-if="initials">{{ initials }}</span>
          <span v-else class="material-symbols-outlined" aria-hidden="true">person</span>
        </AccountAvatar>
        <span class="material-symbols-outlined hidden text-muted sm:block" aria-hidden="true">expand_more</span>
      </button>

      <Transition name="workspace-dropdown" mode="out-in">
      <section
        v-if="menu === 'notifications'"
        key="notifications"
        id="workspace-notifications"
        class="absolute top-[calc(100%+0.75rem)] right-0 z-60 w-[min(26rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
        :aria-label="t('Notifikasi')"
      >
        <div class="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 class="font-semibold">{{ t('Notifikasi') }}</h2>
          <span class="text-xs text-muted">{{ unreadCount === undefined ? '—' : formatNumber(unreadCount) }}</span>
        </div>
        <p v-if="notificationLoading && !notifications.length" role="status" class="p-5 text-sm text-muted">{{ t('Memuat notifikasi…') }}</p>
        <div v-else-if="notificationError && !notifications.length" class="p-5">
          <p class="mb-3 text-sm text-error">{{ t(notificationError) }}</p>
          <button type="button" class="min-h-11 text-sm font-semibold text-primary underline" @click="loadNotifications(true)">{{ t('Coba lagi') }}</button>
        </div>
        <p v-else-if="!notifications.length" class="p-5 text-sm text-muted">{{ t('Belum ada notifikasi.') }}</p>
        <div v-else class="max-h-[min(65vh,34rem)] overflow-y-auto">
          <button
            v-for="item in notifications"
            :key="item.guid"
            type="button"
            class="flex w-full items-start gap-3 border-b border-line px-5 py-4 text-left hover:bg-soft"
            :class="!item.read_at && 'bg-[#f6faf7]'"
            :aria-label="t('Buka notifikasi: :title', { title: notificationCopy(item).title })"
            :disabled="markingRead"
            @click="openNotification(item)"
          >
            <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="item.read_at ? 'bg-transparent' : 'bg-primary'" aria-hidden="true"></span>
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold">{{ notificationCopy(item).title }}</span>
              <span class="mt-1 block text-sm leading-5 text-muted">{{ notificationCopy(item).message }}</span>
              <span class="mt-2 block text-xs text-muted">{{ dateLabel(item.created_at) }}</span>
            </span>
          </button>
        </div>
        <div v-if="notificationError && notifications.length" class="px-5 pt-3">
          <p class="text-xs text-error">{{ t(notificationError) }}</p>
          <button type="button" class="min-h-10 text-xs font-semibold text-primary underline" :disabled="notificationLoading" @click="loadNotifications(true)">{{ t('Coba lagi') }}</button>
        </div>
        <button
          v-if="notificationPage < notificationLastPage"
          type="button"
          class="min-h-12 w-full text-sm font-semibold text-primary hover:bg-soft disabled:opacity-50"
          :disabled="notificationLoading"
          @click="loadNotifications()"
        >{{ notificationLoading ? t('Memuat…') : t('Muat lainnya') }}</button>
      </section>

      <section
        v-else-if="menu === 'profile'"
        key="profile"
        id="workspace-profile"
        class="absolute top-[calc(100%+0.75rem)] right-0 z-60 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-line bg-white p-4 shadow-xl"
        :aria-label="t('Profil akun')"
      >
        <div class="flex min-w-0 items-center gap-3 border-b border-line pb-4">
          <AccountAvatar class="size-12">
            <span v-if="initials">{{ initials }}</span>
            <span v-else class="material-symbols-outlined" aria-hidden="true">person</span>
          </AccountAvatar>
          <span class="min-w-0">
            <span class="block font-semibold wrap-anywhere">{{ auth.user?.name }}</span>
            <span class="block text-sm text-muted wrap-anywhere">{{ auth.user?.email }}</span>
          </span>
        </div>
        <FeedbackMessage :message="t(logoutError)" error />
        <RouterLink to="/profile" class="mt-2 flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-soft" @click="menu = null">
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">person</span>{{ t('Profil') }}
        </RouterLink>
        <button type="button" class="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-error hover:bg-red-50 disabled:opacity-50" :disabled="logoutBusy" @click="logout">
          <span class="material-symbols-outlined text-[20px]" aria-hidden="true">logout</span>{{ logoutBusy ? t('Keluar…') : t('Keluar') }}
        </button>
      </section>
      </Transition>
    </div>
  </header>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import BaseButton from '../components/ui/BaseButton.vue'
import FeedbackMessage from '../components/ui/FeedbackMessage.vue'
import WorkspaceHeader from '../components/workspace/WorkspaceHeader.vue'
import WorkspaceSidebar from '../components/workspace/WorkspaceSidebar.vue'
import { authMode } from '../services/http'
import { t } from '../services/workspace-language'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const collapsed = ref(localStorage.getItem('workspace-sidebar-collapsed') === 'true')
const mobileOpen = ref(false)
const header = ref<{ focusMenuButton: () => void } | null>(null)
const beforeLogout = ref<(() => Promise<boolean>) | null>(null)
provide('workspaceBeforeLogout', beforeLogout)

watch(collapsed, (value) => localStorage.setItem('workspace-sidebar-collapsed', String(value)))
watch(() => route.fullPath, () => {
  if (mobileOpen.value) closeMobile()
})
watch(() => auth.user?.guid, (next, previous) => {
  if (previous && !next) void router.replace({ path: '/login', query: { redirect: route.fullPath } })
})

function closeMobile(restoreFocus = true) {
  mobileOpen.value = false
  if (restoreFocus) header.value?.focusMenuButton()
}

async function toggleSidebar() {
  if (window.matchMedia('(min-width: 1024px)').matches) {
    collapsed.value = !collapsed.value
    return
  }
  mobileOpen.value = !mobileOpen.value
  if (mobileOpen.value) {
    await nextTick()
    document.querySelector<HTMLElement>('#workspace-sidebar a[href], #workspace-sidebar button:not(:disabled)')?.focus()
  } else header.value?.focusMenuButton()
}

function keydown(event: KeyboardEvent) {
  if (!mobileOpen.value) return
  if (event.key === 'Escape') {
    closeMobile()
    return
  }
  if (event.key !== 'Tab') return
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(
    '#workspace-sidebar a[href], #workspace-sidebar button:not(:disabled)',
  ))
  if (!nodes.length) return
  const first = nodes[0]!
  const last = nodes[nodes.length - 1]!
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

async function retry() {
  await auth.refresh()
  if (!auth.sessionError) await router.replace(route.fullPath)
}

onMounted(() => document.addEventListener('keydown', keydown))
onUnmounted(() => document.removeEventListener('keydown', keydown))
</script>

<template>
  <div class="min-h-dvh bg-[#f7f9f8] text-[#141c30]">
    <div v-if="authMode !== 'api'" class="mx-auto max-w-lg p-6 pt-20">
      <h1 class="mb-4 text-3xl font-semibold">{{ t('Workspace memerlukan API') }}</h1>
      <p class="mb-6 text-sm text-muted">
        {{ t('Aktifkan VITE_AUTH_MODE=api dan origin backend untuk memakai dokumen serta aset akun. Tidak ada sesi atau dokumen contoh dibuat.') }}
      </p>
      <RouterLink to="/" class="text-primary underline">{{ t('Kembali ke beranda') }}</RouterLink>
    </div>
    <div v-else-if="auth.sessionError" class="mx-auto max-w-lg p-6 pt-20">
      <h1 class="mb-5 text-2xl font-semibold">{{ t('Sesi belum dapat diperiksa') }}</h1>
      <FeedbackMessage :message="t(auth.sessionError)" error />
      <BaseButton :loading="auth.restoring" @click="retry">{{ t('Periksa sesi lagi') }}</BaseButton>
    </div>
    <template v-else-if="auth.user">
      <button
        v-if="mobileOpen"
        type="button"
        class="fixed inset-0 z-40 bg-[#141c30]/35 lg:hidden"
        :aria-label="t('Tutup menu')"
        @click="closeMobile()"
      ></button>
      <WorkspaceSidebar
        :collapsed="collapsed"
        :mobile-open="mobileOpen"
        @close="closeMobile()"
      />
      <div class="min-h-dvh transition-[padding] duration-200 motion-reduce:transition-none" :class="collapsed ? 'lg:pl-[72px]' : 'lg:pl-72'">
        <div :inert="mobileOpen || undefined">
          <WorkspaceHeader :key="auth.user.guid" ref="header" @toggle-sidebar="toggleSidebar" />
          <main id="main" class="mx-auto min-w-0 max-w-[1440px] p-4 sm:p-8">
            <RouterView v-slot="{ Component }">
              <component :is="Component" v-if="Component" :key="auth.user.guid" />
            </RouterView>
          </main>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, provide } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import BrandLogo from '../components/brand/BrandLogo.vue'
import BaseButton from '../components/ui/BaseButton.vue'
import FeedbackMessage from '../components/ui/FeedbackMessage.vue'
import { authMode } from '../services/http'
const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const open = ref(false)
const drawer = ref<HTMLElement>()
const menuButton = ref<HTMLButtonElement>()
const busy = ref(false)
const error = ref('')
const beforeLogout = ref<(() => Promise<boolean>) | null>(null)
provide('workspaceBeforeLogout', beforeLogout)
function closeMenu() {
  open.value = false
  menuButton.value?.focus()
}
async function openMenu() {
  open.value = true
  await nextTick()
  drawer.value?.querySelector<HTMLElement>('a')?.focus()
}
watch(
  () => route.fullPath,
  () => {
    open.value = false
  },
)
watch(
  () => auth.user?.guid,
  (next, previous) => {
    if (previous && !next) void router.replace({ path: '/login', query: { redirect: route.path } })
  },
)
function keydown(event: KeyboardEvent) {
  if (!open.value) return
  if (event.key === 'Escape') {
    open.value = false
    menuButton.value?.focus()
  }
  if (event.key === 'Tab') {
    const nodes = drawer.value?.querySelectorAll<HTMLElement>('a, button')
    if (!nodes?.length) return
    const first = nodes[0]!,
      last = nodes[nodes.length - 1]!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}
onMounted(() => document.addEventListener('keydown', keydown))
onUnmounted(() => document.removeEventListener('keydown', keydown))
async function retry() {
  await auth.refresh()
  if (!auth.sessionError) await router.replace(route.fullPath)
}
async function logout() {
  if (busy.value) return
  if (beforeLogout.value && !(await beforeLogout.value())) return
  busy.value = true
  error.value = ''
  try {
    await auth.logout()
    await router.replace('/login')
  } catch {
    error.value = 'Belum dapat keluar. Coba lagi.'
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <div class="min-h-dvh bg-soft text-ink">
    <div v-if="authMode !== 'api'" class="mx-auto max-w-lg p-6 pt-20">
      <BrandLogo />
      <h1 class="mt-10 mb-4 text-3xl font-semibold">Workspace memerlukan API</h1>
      <p class="mb-6 text-sm text-muted">
        Aktifkan VITE_AUTH_MODE=api dan origin backend untuk memakai dokumen serta aset akun. Tidak
        ada sesi atau dokumen contoh dibuat.
      </p>
      <RouterLink to="/" class="text-primary underline">Kembali ke beranda</RouterLink>
    </div>
    <div v-else-if="auth.sessionError" class="mx-auto max-w-lg p-6 pt-20">
      <FeedbackMessage :message="auth.sessionError" error /><BaseButton @click="retry"
        >Periksa sesi lagi</BaseButton
      >
    </div>
    <template v-else-if="auth.user">
      <button
        v-if="open"
        type="button"
        class="fixed inset-0 z-30 bg-ink/30 md:hidden"
        aria-label="Tutup navigasi"
        @click="open = false"
      ></button>
      <aside
        ref="drawer"
        class="fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-line bg-white p-6 md:flex"
        :class="open ? 'flex' : 'hidden'"
      >
        <BrandLogo /><button
          v-if="open"
          class="my-3 min-h-11 text-left md:hidden"
          @click="closeMenu"
        >
          Tutup menu
        </button>
        <p class="mt-10 mb-4 text-[10px] font-bold tracking-[0.18em] text-muted">WORKSPACE</p>
        <nav aria-label="Navigasi workspace" class="grid gap-2 text-sm">
          <RouterLink
            v-for="item in [
              { to: '/dashboard', label: 'Ringkasan' },
              { to: '/documents', label: 'Dokumen Saya' },
              { to: '/signature-assets', label: 'Tanda Tangan Saya' },
            ]"
            :key="item.to"
            :to="item.to"
            class="rounded-lg px-4 py-3.5 hover:bg-soft"
            :class="
              route.path.startsWith(item.to) ? 'bg-sage font-semibold text-primary' : 'text-muted'
            "
            :aria-current="route.path.startsWith(item.to) ? 'page' : undefined"
            >{{ item.label }}</RouterLink
          >
        </nav>
        <div class="mt-auto border-t border-line pt-5">
          <p class="text-sm font-semibold wrap-anywhere">{{ auth.user.name }}</p>
          <p class="mt-1 text-xs text-muted wrap-anywhere">{{ auth.user.email }}</p>
          <FeedbackMessage :message="error" error /><button
            class="mt-4 min-h-11 text-sm text-primary underline disabled:opacity-50"
            :disabled="busy"
            @click="logout"
          >
            {{ busy ? 'Keluar…' : 'Logout' }}
          </button>
        </div>
      </aside>
      <div class="min-w-0 md:ml-64">
        <header class="flex min-h-20 items-center gap-4 border-b border-line bg-white px-5 sm:px-8">
          <button
            ref="menuButton"
            type="button"
            class="min-h-11 rounded border border-line px-3 text-sm md:hidden"
            :aria-expanded="open"
            @click="openMenu"
          >
            Menu</button
          ><span class="text-sm text-muted"
            >Dokumen Kita <span aria-hidden="true">/</span> {{ route.meta.title }}</span
          >
        </header>
        <main id="main" class="mx-auto max-w-[1440px] p-4 sm:p-8" :inert="open || undefined">
          <RouterView v-slot="{ Component }"
            ><component :is="Component" :key="`${route.path}:${auth.user.guid}`"
          /></RouterView>
        </main>
      </div>
    </template>
  </div>
</template>

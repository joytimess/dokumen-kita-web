<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import FeedbackMessage from './components/ui/FeedbackMessage.vue'
import BaseButton from './components/ui/BaseButton.vue'
import { afterAuthentication } from './utils/authRedirect'
import { pendingInvitation } from './utils/invitation'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const sessionBlocked = computed(
  () => auth.sessionError && ['/login', '/register'].includes(route.path),
)
async function retrySession() {
  await auth.refresh()
  if (!auth.sessionError && auth.user)
    await router.replace(
      afterAuthentication(
        auth.user.email_verified,
        pendingInvitation() ? '/invitations/claim' : route.query.redirect,
      ),
    )
}
const returningHome = computed(() => route.path === '/')
function freezeLeavingPage(element: Element) {
  const page = element as HTMLElement
  const bounds = page.getBoundingClientRect()
  // Keep the old page at its visible position while the new page takes over document flow.
  Object.assign(page.style, {
    position: 'fixed',
    top: `${bounds.top}px`,
    left: `${bounds.left}px`,
    width: `${bounds.width}px`,
    pointerEvents: 'none',
    zIndex: '10',
  })
  page.inert = true
}
onMounted(() => {
  void useAuthStore().restore()
})
</script>
<template>
  <a class="fixed -top-24 left-4 z-100 bg-white p-3 text-primary focus:top-3" href="#main"
    >Lewati ke konten</a
  >
  <main v-if="sessionBlocked" id="main" class="mx-auto max-w-lg p-6 pt-24">
    <h1 class="mb-5 text-2xl text-ink">Sesi belum dapat diperiksa</h1>
    <FeedbackMessage :message="auth.sessionError" error /><BaseButton
      :loading="auth.restoring"
      @click="retrySession"
      >Coba lagi</BaseButton
    >
  </main>
  <RouterView v-else v-slot="{ Component }">
    <Transition
      @before-leave="freezeLeavingPage"
      enter-active-class="transition-[opacity,transform] duration-800 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[opacity,transform] motion-reduce:transition-none"
      enter-from-class="opacity-0 translate-y-6 motion-reduce:transform-none"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition-[opacity,transform] duration-400 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[opacity,transform] motion-reduce:transition-none"
      leave-from-class="opacity-100 translate-y-0"
      :leave-to-class="
        returningHome
          ? 'opacity-0 -translate-y-3 motion-reduce:transform-none'
          : 'opacity-0 translate-y-3 motion-reduce:transform-none'
      "
    >
      <div v-if="Component" :key="route.path" class="flow-root min-h-dvh bg-white">
        <component :is="Component" />
      </div>
    </Transition>
  </RouterView>
</template>

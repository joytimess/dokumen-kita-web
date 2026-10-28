<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import FeedbackMessage from './components/ui/FeedbackMessage.vue'
import BaseButton from './components/ui/BaseButton.vue'
import InteractionHost from './components/ui/InteractionHost.vue'
import { afterAuthentication } from './utils/authRedirect'
import { pendingInvitation } from './utils/invitation'
import { t } from './services/workspace-language'
import AuthLayout from './layouts/AuthLayout.vue'
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const authPaths = ['/login', '/register', '/forgot-password']
const authPage = computed(() => authPaths.includes(route.path))
const pageMotion = ref('page-none')
const formMotion = ref('auth-swipe-left')
watch(() => route.path, (to, from) => {
  const fromIndex = authPaths.indexOf(from)
  const toIndex = authPaths.indexOf(to)
  const wasAuth = fromIndex !== -1
  const isAuth = toIndex !== -1
  if (wasAuth && isAuth) formMotion.value = toIndex > fromIndex ? 'auth-swipe-left' : 'auth-swipe-right'
  else pageMotion.value = from === '/' && isAuth ? 'page-to-auth' : wasAuth && to === '/' ? 'page-to-landing' : 'page-none'
}, { flush: 'sync' })
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
onMounted(() => {
  void useAuthStore().restore()
})
</script>
<template>
  <a class="fixed -top-24 left-4 z-100 bg-white p-3 text-primary focus:top-3" href="#main"
    >{{ t('Lewati ke konten') }}</a
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
    <Transition :name="pageMotion">
      <AuthLayout v-if="Component && authPage" key="auth" kind="login" :form-motion="formMotion">
        <component :is="Component" :key="route.path" />
      </AuthLayout>
      <div v-else-if="Component" :key="route.path" class="flow-root min-h-dvh bg-white">
        <component :is="Component" />
      </div>
    </Transition>
  </RouterView>
  <InteractionHost />
</template>

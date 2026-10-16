<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'
import FeedbackMessage from './components/ui/FeedbackMessage.vue'
import BaseButton from './components/ui/BaseButton.vue'
import InteractionHost from './components/ui/InteractionHost.vue'
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
    <div v-if="Component" :key="route.path" class="flow-root min-h-dvh bg-white">
      <component :is="Component" />
    </div>
  </RouterView>
  <InteractionHost />
</template>

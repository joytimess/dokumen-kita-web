<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { createEmailVerification } from '../../composables/useEmailVerification'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'

const props = defineProps<{ watchFocus?: boolean }>()
const auth = useAuthStore()
const router = useRouter()
let storage: Storage | undefined
try {
  storage = window.sessionStorage
} catch {
  /* Cooldown remains in memory. */
}
const verification = createEmailVerification(auth, {
  storage,
  onExpired: () => {
    void router.replace({
      path: '/login',
      query: { redirect: '/email/verify', error: 'session_expired' },
    })
  },
})
const { remaining, sending, checking, message, failed } = verification
let timer: ReturnType<typeof setInterval> | undefined
function onReturn() {
  if (props.watchFocus && document.visibilityState === 'visible') void verification.check(true)
}
onMounted(() => {
  timer = setInterval(verification.tick, 1000)
  window.addEventListener('focus', onReturn)
  document.addEventListener('visibilitychange', onReturn)
})
onUnmounted(() => {
  clearInterval(timer)
  verification.dispose()
  window.removeEventListener('focus', onReturn)
  document.removeEventListener('visibilitychange', onReturn)
})
</script>
<template>
  <div class="mt-4" aria-live="polite" aria-atomic="true">
    <FeedbackMessage :message="message" :error="failed" />
  </div>
  <div v-if="auth.user && !auth.user.email_verified" class="flex flex-wrap gap-3">
    <BaseButton
      :loading="sending"
      :disabled="sending || remaining > 0"
      @click="verification.resend"
    >
      {{
        sending
          ? 'Mengirim permintaan…'
          : remaining
            ? `Kirim ulang dalam ${remaining} detik`
            : 'Kirim ulang email verifikasi'
      }}
    </BaseButton>
  </div>
</template>

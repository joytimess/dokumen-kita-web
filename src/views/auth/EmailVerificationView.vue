<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { workspaceDestination } from '../../utils/authRedirect'
import { pendingInvitation } from '../../utils/invitation'
import { pendingSigningQr } from '../../utils/signingQr'
import AuthLayout from '../../layouts/AuthLayout.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
import EmailVerificationActions from '../../components/auth/EmailVerificationActions.vue'
import { useAuthStore } from '../../stores/auth'
import { authMode } from '../../services/http'

const props = defineProps<{ result?: boolean }>()
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const destination = computed(() => pendingSigningQr() ? '/sign/qr' : pendingInvitation() ? '/invitations/claim' : workspaceDestination(route.query.redirect))
const loading = ref(true)
const confirmed = computed(
  () => !loading.value && !auth.sessionError && auth.user?.email_verified === true,
)
function redirect() {
  if (props.result || loading.value || auth.restoring || auth.sessionError || authMode !== 'api')
    return
  if (!auth.user) void router.replace({ path: '/login', query: { redirect: '/email/verify' } })
  else if (auth.user.email_verified) void router.replace(destination.value)
}
watch(() => [auth.user, auth.restoring, auth.sessionError], redirect)
async function load(force = false) {
  loading.value = true
  if (force || props.result) await auth.refresh()
  else await auth.restore()
  loading.value = false
  redirect()
}
onMounted(() => load())
</script>
<template>
  <AuthLayout kind="email-verification">
    <div class="auth-verification-stage">
      <div class="auth-verification-icon" aria-hidden="true">
        <Transition name="auth-verification-icon-transition" mode="out-in">
          <svg
            v-if="loading"
            key="checking"
            class="auth-verification-spinner"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              stroke-opacity=".25"
              stroke-width="2"
            />
            <path
              d="M12 3a9 9 0 0 1 9 9"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          <svg
            v-else-if="authMode === 'api' && confirmed"
            key="verified"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <path d="m5 12 4 4L19 6" />
          </svg>
          <svg
            v-else
            key="email"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.7"
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 6 9 7 9-7" />
          </svg>
        </Transition>
      </div>
      <div class="auth-verification-content-stage">
        <Transition name="auth-verification-transition">
          <div
            v-if="loading"
            key="checking"
            class="auth-verification-state"
            role="status"
            aria-live="polite"
          >
            <h1 class="auth-verification-heading">Memeriksa status email…</h1>
            <p class="auth-verification-copy">
              Tunggu sebentar, kami sedang memeriksa sesi akunmu.
            </p>
          </div>
          <div
            v-else-if="authMode !== 'api'"
            key="prototype"
            class="auth-verification-state"
          >
            <h1 class="auth-verification-heading">Verifikasi email kamu</h1>
            <FeedbackMessage
              message="Mode prototype · verifikasi email memerlukan API autentikasi. Belum ada email dikirim atau status akun diubah."
            />
            <RouterLink to="/login" class="auth-verification-link">
              Kembali ke halaman masuk
            </RouterLink>
          </div>
          <div
            v-else-if="auth.sessionError"
            key="session-error"
            class="auth-verification-state"
          >
            <h1 class="auth-verification-heading">Status verifikasi email</h1>
            <div aria-live="polite"><FeedbackMessage :message="auth.sessionError" error /></div>
            <BaseButton class="auth-verification-primary" @click="load(true)">
              Coba lagi
            </BaseButton>
          </div>
          <div
            v-else-if="confirmed"
            key="verified"
            class="auth-verification-state"
          >
            <h1 class="auth-verification-heading">Email kamu sudah terverifikasi</h1>
            <p class="auth-verification-copy">
              Terima kasih, alamat email akunmu sudah dikonfirmasi.
            </p>
            <RouterLink :to="destination" class="auth-verification-primary">
              Lanjutkan
            </RouterLink>
          </div>
          <div
            v-else-if="!auth.user"
            key="login"
            class="auth-verification-state"
          >
            <h1 class="auth-verification-heading">
              Masuk untuk melihat status verifikasi email kamu
            </h1>
            <p class="auth-verification-copy">
              Masuk ke akunmu agar kami dapat memeriksa status email terbaru.
            </p>
            <RouterLink
              :to="{ path: '/login', query: { redirect: '/email/verified' } }"
              class="auth-verification-primary"
            >
              Masuk
            </RouterLink>
          </div>
          <div
            v-else-if="result"
            key="mismatch"
            class="auth-verification-state"
          >
            <h1 class="auth-verification-heading">
              Email akun yang sedang masuk belum terverifikasi
            </h1>
            <p class="auth-verification-copy">
              Tautan yang dibuka mungkin berasal dari akun lain. Periksa email untuk akun yang
              sedang masuk.
            </p>
            <RouterLink to="/email/verify" class="auth-verification-primary">
              Verifikasi email akun ini
            </RouterLink>
          </div>
          <div v-else key="unverified" class="auth-verification-state">
            <h1 class="auth-verification-heading">Verifikasi email kamu</h1>
            <p class="auth-verification-email"><strong>{{ auth.user.email }}</strong></p>
            <p class="auth-verification-copy">
              Buka kotak masuk dan klik tautan verifikasi yang kami kirim ke alamat email ini.
            </p>
            <p class="auth-verification-help">
              Belum menerima email? Periksa juga folder spam.
            </p>
            <EmailVerificationActions watch-focus />
          </div>
        </Transition>
      </div>
    </div>
  </AuthLayout>
</template>

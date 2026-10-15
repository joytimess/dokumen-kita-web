<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { workspaceDestination } from '../../utils/authRedirect'
import { pendingInvitation } from '../../utils/invitation'
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
const destination = computed(() => pendingInvitation() ? '/invitations/claim' : workspaceDestination(route.query.redirect))
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
  <AuthLayout compact>
    <p class="mb-5 text-[11px] font-bold tracking-[0.16em] text-primary">KONFIRMASI AKUN</p>
    <div
      class="mb-5 grid size-14 place-items-center rounded-full bg-sage text-primary"
      aria-hidden="true"
    >
      <svg class="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7">
        <path v-if="confirmed" d="m5 12 4 4L19 6" />
        <template v-else>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 6 9 7 9-7" />
        </template>
      </svg>
    </div>
    <div v-if="loading" role="status" aria-live="polite">
      <h1>Memeriksa status email…</h1>
      <p class="text-sm text-muted">Tunggu sebentar, kami sedang memeriksa sesi akunmu.</p>
    </div>
    <template v-else-if="authMode !== 'api'">
      <h1>Verifikasi email kamu</h1>
      <FeedbackMessage
        message="Mode prototype · verifikasi email memerlukan API autentikasi. Belum ada email dikirim atau status akun diubah."
      />
      <RouterLink to="/login" class="inline-flex min-h-11 items-center text-primary underline"
        >Kembali ke halaman masuk</RouterLink
      >
    </template>
    <template v-else-if="auth.sessionError">
      <h1>Status verifikasi email</h1>
      <div aria-live="polite"><FeedbackMessage :message="auth.sessionError" error /></div>
      <BaseButton @click="load(true)">Coba lagi</BaseButton>
    </template>
    <template v-else-if="confirmed">
      <h1>Email kamu sudah terverifikasi</h1>
      <p class="mb-6 text-sm leading-relaxed text-muted">
        Terima kasih, alamat email akunmu sudah dikonfirmasi.
      </p>
      <RouterLink
        :to="destination"
        class="inline-flex min-h-12 items-center rounded-[7px] bg-primary px-6 py-3 text-sm font-semibold text-white"
        >Lanjutkan</RouterLink
      >
    </template>
    <template v-else-if="!auth.user">
      <h1>Masuk untuk melihat status verifikasi email kamu</h1>
      <p class="mb-6 text-sm leading-relaxed text-muted">
        Masuk ke akunmu agar kami dapat memeriksa status email terbaru.
      </p>
      <RouterLink
        :to="{ path: '/login', query: { redirect: '/email/verified' } }"
        class="inline-flex min-h-12 items-center rounded-[7px] bg-primary px-6 py-3 text-sm font-semibold text-white"
        >Masuk</RouterLink
      >
    </template>
    <template v-else-if="result">
      <h1>Email akun yang sedang masuk belum terverifikasi</h1>
      <p class="mb-6 text-sm leading-relaxed text-muted">
        Tautan yang dibuka mungkin berasal dari akun lain. Periksa email untuk akun yang sedang
        masuk.
      </p>
      <RouterLink
        to="/email/verify"
        class="inline-flex min-h-12 items-center rounded-[7px] bg-primary px-6 py-3 text-sm font-semibold text-white"
        >Verifikasi email akun ini</RouterLink
      >
    </template>
    <template v-else>
      <h1>Verifikasi email kamu</h1>
      <p class="mb-4 text-sm leading-relaxed text-muted">
        Buka email verifikasi untuk <strong class="break-all text-ink">{{ auth.user.email }}</strong
        >, lalu klik tautan di dalamnya.
      </p>
      <p class="text-sm leading-relaxed text-muted">
        Belum menerima email? Periksa folder spam atau kirim ulang email verifikasi.
      </p>
      <EmailVerificationActions watch-focus />
    </template>
  </AuthLayout>
</template>

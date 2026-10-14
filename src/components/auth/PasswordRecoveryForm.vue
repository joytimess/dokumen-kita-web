<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '../ui/BaseButton.vue'
import FormField from '../ui/FormField.vue'
import PasswordField from '../ui/PasswordField.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import { authMode } from '../../services/http'
import { authApi } from '../../services/auth.service'
import { createRecoveryPrototype } from '../../services/recovery.mock'
import { createPasswordRecovery } from '../../composables/usePasswordRecovery'
import { expiredMessage, normalizeEmail } from '../../utils/recovery'
import { useAuthStore } from '../../stores/auth'
const auth = useAuthStore()
const router = useRouter()
const recovery = createPasswordRecovery(authMode === 'api' ? authApi : createRecoveryPrototype(), {
  onSuccess(email) {
    if (authMode === 'api' && auth.user && normalizeEmail(auth.user.email) === email) { auth.user = null; auth.sessionError = '' }
  },
})
const { stage, fields, errors, message, failed, busy, otpConsumed, otpRemaining, resendRemaining, blockedRemaining, canVerify } = recovery
const form = ref<HTMLFormElement>()
const successTitle = ref<HTMLElement>()
const copy = computed(() => ({
  email: { title: 'Lupa kata sandi?', description: 'Masukkan email akun Anda untuk meminta kode OTP pemulihan password.', button: 'Kirim kode OTP' },
  otp: { title: 'Masukkan kode OTP', description: 'Masukkan kode 6 digit dari email pemulihan Anda.', button: 'Verifikasi kode' },
  password: { title: 'Buat password baru', description: 'Gunakan password baru untuk masuk kembali ke akun Anda.', button: 'Simpan password baru' },
  success: { title: authMode === 'prototype' ? 'Simulasi pemulihan selesai' : 'Password diperbarui', description: '', button: '' },
})[stage.value])
const step = computed(() => stage.value === 'email' ? 0 : stage.value === 'otp' ? 1 : 2)
async function focusFirst() {
  await nextTick()
  if (stage.value === 'success') successTitle.value?.focus()
  else form.value?.querySelector<HTMLInputElement>('input')?.focus()
}
watch(stage, focusFirst)
async function submit(resend = false) {
  await recovery.submit(resend)
  await nextTick()
  form.value?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
}
async function login() { if (!busy.value) { recovery.clear(); await router.push('/login') } }
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
onMounted(() => { recovery.start(document); void focusFirst() })
onUnmounted(recovery.dispose)
</script>
<template>
  <p class="mb-6 text-[11px] font-bold tracking-[0.16em] text-primary">PULIHKAN AKSES ANDA</p>
  <ol v-if="stage !== 'success'" aria-label="Tahap pemulihan" class="mb-6 grid grid-cols-3 gap-2 text-[11px] text-muted">
    <li v-for="(label, index) in ['Email', 'Kode OTP', 'Password baru']" :key="label" :aria-current="index === step ? 'step' : undefined" class="border-b-2 pb-2" :class="index === step ? 'border-primary font-bold text-primary' : 'border-line'">
      <span>{{ index + 1 }}. {{ label }}</span><span v-if="index === step" class="sr-only"> — tahap aktif</span>
    </li>
  </ol>
  <h1 ref="successTitle" :tabindex="stage === 'success' ? -1 : undefined">{{ copy.title }}</h1>
  <p class="mb-5 text-[13px] leading-[1.8] text-muted">{{ copy.description }}</p>
  <p v-if="authMode === 'prototype'" class="mb-5 rounded-md border border-line bg-soft px-3 py-2.5 text-[11px] text-muted">Mode prototype — kode demo 123456; tidak ada email atau password akun yang diubah.</p>
  <FeedbackMessage :message="stage === 'success' && authMode === 'prototype' ? 'Simulasi selesai. Tidak ada password akun yang diubah.' : message" :error="failed" />
  <template v-if="stage !== 'success'">
    <p v-if="stage !== 'email'" class="mb-4 text-xs wrap-anywhere text-muted">Email: <strong>{{ fields.email }}</strong></p>
    <form ref="form" novalidate :aria-busy="busy" @submit.prevent="submit()">
      <FormField v-if="stage === 'email'" id="recovery-email" v-model="fields.email" label="Email" type="email" autocomplete="email" :maxlength="255" :error="errors.email" :disabled="busy" />
      <template v-if="stage === 'otp'">
        <FeedbackMessage v-if="!otpRemaining && !otpConsumed" :message="expiredMessage" error />
        <FeedbackMessage v-if="otpConsumed && !message" message="Minta kode baru untuk melanjutkan. Kode sebelumnya sudah tidak dapat digunakan." error />
        <FormField id="recovery-otp" v-model="fields.otp" label="Kode OTP" inputmode="numeric" autocomplete="one-time-code" :maxlength="6" :error="errors.otp" :disabled="busy || otpConsumed || !otpRemaining" hint="Kode berlaku selama 5 menit. Jangan bagikan kode kepada siapa pun." />
        <p class="mb-3 text-xs text-muted">Masa berlaku kode: {{ formatTime(otpRemaining) }}</p>
      </template>
      <template v-if="stage === 'password'">
        <PasswordField id="recovery-password" v-model="fields.password" label="Password baru" autocomplete="new-password" hint="Minimal 8 karakter." :error="errors.password" :disabled="busy" />
        <PasswordField id="recovery-confirmation" v-model="fields.password_confirmation" label="Konfirmasi password baru" autocomplete="new-password" :error="errors.password_confirmation" :disabled="busy" />
      </template>
      <p v-if="blockedRemaining" class="mb-3 text-xs text-muted">Coba kembali dalam {{ formatTime(blockedRemaining) }}.</p>
      <BaseButton type="submit" class="w-full" :loading="busy" :disabled="busy || !!blockedRemaining || (stage === 'otp' && !canVerify)">{{ busy ? 'Memproses…' : copy.button }}</BaseButton>
    </form>
    <div v-if="stage === 'otp'" class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
      <button type="button" class="min-h-11 text-primary underline disabled:text-muted disabled:no-underline" :disabled="busy || !!resendRemaining" @click="submit(true)">{{ resendRemaining ? `Kirim ulang dalam ${formatTime(resendRemaining)}` : 'Kirim ulang kode' }}</button>
      <button type="button" class="min-h-11 text-primary underline disabled:text-muted" :disabled="busy" @click="recovery.changeEmail">Ubah email</button>
      <span class="sr-only" role="status">{{ resendRemaining === 0 ? 'Kirim ulang kode tersedia.' : '' }}</span>
    </div>
    <p v-if="stage === 'email'" class="mt-4 text-xs leading-relaxed text-muted">Jika Anda biasanya masuk dengan Google, gunakan Masuk dengan Google pada halaman masuk.</p>
  </template>
  <button type="button" class="mt-5 min-h-11 w-full text-center text-xs font-semibold text-primary hover:underline disabled:opacity-65" :disabled="busy" @click="login">{{ stage === 'success' ? 'Kembali masuk' : '← Kembali ke masuk' }}</button>
</template>

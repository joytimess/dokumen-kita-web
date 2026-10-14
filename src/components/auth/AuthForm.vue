<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import BaseButton from '../ui/BaseButton.vue'
import FormField from '../ui/FormField.vue'
import PasswordField from '../ui/PasswordField.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import { authMode } from '../../services/http'
import { authApi } from '../../services/auth.service'
import { prototypeSubmit } from '../../services/auth.mock'
import { authError } from '../../services/auth.errors'
import { validateAuth } from '../../utils/validation'
import { useAuthStore } from '../../stores/auth'
import type { AuthKind, FieldErrors } from '../../types/auth'
const props = defineProps<{ kind: AuthKind }>()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const fields = reactive({
  name: '',
  email: '',
  password: '',
  password_confirmation: '',
  remember: false,
})
const errors = ref<FieldErrors>({})
const message = ref('')
const failed = ref(false)
const busy = ref(false)
const form = ref<HTMLFormElement>()
const copy = computed(
  () =>
    ({
      login: {
        title: 'Selamat datang kembali.',
        description: 'Masuk untuk melanjutkan proses dokumen Anda.',
        button: 'Masuk',
      },
      register: {
        title: 'Mulai dari satu akun.',
        description: 'Siapkan dokumen dan jalani proses tanda tangan dengan lebih terarah.',
        button: 'Buat akun',
      },
    })[props.kind],
)
const oauthError = computed(() => {
  if (props.kind !== 'login') return ''
  const messages: Record<string, string> = {
    oauth_denied: 'Masuk dengan Google dibatalkan. Silakan coba kembali.',
    email_not_verified:
      'Email akun Google belum terverifikasi. Gunakan akun dengan email terverifikasi.',
    oauth_failed: 'Masuk dengan Google belum dapat diproses. Silakan coba lagi.',
  }
  return typeof route.query.error === 'string' ? messages[route.query.error] || '' : ''
})
async function focusError() {
  await nextTick()
  form.value?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()
}
async function submit() {
  if (busy.value || auth.restoring) return
  message.value = ''
  failed.value = false
  errors.value = validateAuth(props.kind, fields)
  if (Object.keys(errors.value).length) {
    await focusError()
    return
  }
  busy.value = true
  try {
    if (authMode === 'prototype') message.value = await prototypeSubmit(props.kind)
    else {
      auth.user =
        props.kind === 'login'
          ? await authApi.login({
              email: fields.email.trim(),
              password: fields.password,
              remember: fields.remember,
            })
          : await authApi.register({
              name: fields.name.trim(),
              email: fields.email.trim(),
              password: fields.password,
              password_confirmation: fields.password_confirmation,
            })
      auth.sessionError = ''
      if (props.kind === 'login') await router.push('/')
      else
        message.value = auth.user.email_verified
          ? 'Akun Anda sudah terautentikasi.'
          : 'Akun Anda sudah dibuat dan sesi aktif. Email perlu diverifikasi; periksa email Anda. Halaman hasil verifikasi tersedia pada tahap berikutnya.'
    }
  } catch (error) {
    const feedback = authError(error, props.kind)
    errors.value = feedback.fields
    message.value = feedback.message
    failed.value = true
    if (feedback.expired) auth.user = null
  } finally {
    busy.value = false
    await focusError()
  }
}
async function logout() {
  if (busy.value || auth.restoring) return
  busy.value = true
  failed.value = false
  message.value = ''
  try {
    await auth.logout()
    fields.password = ''
    fields.password_confirmation = ''
    errors.value = {}
    message.value = 'Anda sudah keluar dari akun.'
  } catch (error) {
    failed.value = true
    message.value = authError(error, 'login').message
  } finally {
    busy.value = false
    await nextTick()
    if (!auth.user) form.value?.querySelector<HTMLInputElement>('#email')?.focus()
  }
}
function google() {
  if (busy.value || auth.restoring) return
  failed.value = false
  if (authMode === 'prototype') {
    message.value = 'Integrasi Google belum aktif pada prototype. Belum ada sesi masuk yang dibuat.'
    return
  }
  try {
    authApi.google()
  } catch {
    failed.value = true
    message.value = 'Origin API belum dikonfigurasi dengan benar. Hubungi pengelola.'
  }
}
</script>
<template>
  <p class="mb-6 text-[11px] font-bold tracking-[0.16em] text-primary">
    SELAMAT DATANG DI DOKUMEN KITA
  </p>
  <h1>{{ copy.title }}</h1>
  <p class="mb-5 text-[13px] leading-[1.8] text-muted sm:text-sm" :class="kind === 'register' ? 'sm:mb-3! sm:leading-relaxed!' : undefined">{{ copy.description }}</p>
  <p
    v-if="authMode === 'prototype'"
    :class="kind === 'register' ? 'sm:mb-3! sm:py-2!' : undefined"
    class="mb-[22px] rounded-md border border-line bg-soft px-3 py-2.5 text-[10px] text-muted"
  >
    Mode prototype · autentikasi dan email belum dihubungkan.
  </p>
  <FeedbackMessage :message="oauthError" error /><FeedbackMessage
    :message="auth.sessionError"
    error
  /><FeedbackMessage :message="message" :error="failed" />
  <template v-if="auth.user"
    ><FeedbackMessage
      :message="`Sesi aktif sebagai ${auth.user.name}.${auth.user.email_verified ? '' : ' Email Anda belum terverifikasi.'}`"
    /><RouterLink
      to="/"
      class="inline-flex min-h-12 items-center justify-center gap-5 rounded-[7px] border border-primary bg-primary px-6 py-3 text-center text-sm font-semibold leading-normal text-white! hover:bg-[#174c39] hover:no-underline! disabled:cursor-wait disabled:opacity-65"
      >Kembali ke beranda</RouterLink
    >
    <BaseButton
      v-if="kind === 'login'"
      class="mt-3 w-full"
      :loading="busy"
      :disabled="busy || auth.restoring"
      @click="logout"
      >{{ busy ? 'Keluar…' : 'Logout' }}</BaseButton
    >
  </template>
  <template v-else>
    <form ref="form" novalidate :aria-busy="busy" :class="kind === 'register' ? 'sm:[&>div]:mb-2.5! sm:[&_label]:mb-1! sm:[&_input]:min-h-11! sm:[&_input]:py-2!' : undefined" @submit.prevent="submit">
      <FormField
        v-if="kind === 'register'"
        id="name"
        v-model="fields.name"
        label="Nama lengkap"
        autocomplete="name"
        :maxlength="255"
        :error="errors.name"
        :disabled="busy"
      />
      <FormField
        id="email"
        v-model="fields.email"
        label="Email"
        type="email"
        autocomplete="email"
        :maxlength="255"
        :error="errors.email"
        :disabled="busy"
      />
      <PasswordField
        id="password"
        v-model="fields.password"
        label="Kata sandi"
        :autocomplete="kind === 'login' ? 'current-password' : 'new-password'"
        :hint="kind === 'register' ? 'Minimal 8 karakter.' : undefined"
        :error="errors.password"
        :disabled="busy"
      />
      <PasswordField
        v-if="kind === 'register'"
        id="password_confirmation"
        v-model="fields.password_confirmation"
        label="Konfirmasi kata sandi"
        autocomplete="new-password"
        :error="errors.password_confirmation"
        :disabled="busy"
      />
      <div
        v-if="kind === 'login'"
        class="mb-[21px] flex items-center justify-between gap-3 text-[11px] max-[360px]:gap-1.5 [&_a]:flex [&_a]:min-h-11 [&_a]:items-center [&_a]:text-primary [&_a:hover]:underline"
      >
        <label
          class="flex min-h-11 items-center gap-[7px] [&_input]:size-[15px] [&_input]:accent-primary"
          ><input v-model="fields.remember" type="checkbox" :disabled="busy" /> Ingat saya</label
        ><RouterLink to="/forgot-password">Lupa kata sandi?</RouterLink>
      </div>
      <BaseButton type="submit" :loading="busy" :disabled="busy || auth.restoring" class="w-full">{{
        busy ? 'Memproses…' : auth.restoring ? 'Memeriksa sesi…' : copy.button
      }}</BaseButton>
    </form>
    <button
      class="mt-3 flex min-h-12 w-full items-center justify-center gap-3 rounded-[7px] border border-line bg-white px-4 py-3 text-[13px] font-semibold text-ink transition-colors hover:bg-soft motion-reduce:transition-none"
      type="button"
      :disabled="busy || auth.restoring"
      @click="google"
    >
      <svg class="size-5 shrink-0" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
        />
      </svg>
      {{ kind === 'login' ? 'Masuk dengan Google' : 'Daftar dengan Google' }}
    </button>
    <p
      v-if="kind === 'login'"
      class="mt-[23px] text-center text-xs text-muted [&_a]:inline-block [&_a]:py-2 [&_a]:font-semibold [&_a]:text-primary [&_a:hover]:underline"
    >
      Belum punya akun? <RouterLink to="/register">Buat akun</RouterLink>
    </p>
    <p
      v-else-if="kind === 'register'"
      class="mt-[23px] text-center text-xs text-muted sm:mt-2! [&_a]:inline-block [&_a]:py-2 [&_a]:font-semibold [&_a]:text-primary [&_a:hover]:underline"
    >
      Sudah punya akun? <RouterLink to="/login">Masuk</RouterLink>
    </p>
  </template>
</template>

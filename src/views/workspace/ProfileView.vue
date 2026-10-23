<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import axios from 'axios'
import { validProfilePhoto } from '../../utils/profilePhoto'
import { useAuthStore } from '../../stores/auth'
import { accountApi } from '../../services/account.service'
import { authMode } from '../../services/http'
import { workspaceError } from '../../services/workspace.errors'
import { confirmAction, notify } from '../../services/feedback'
import { t } from '../../services/workspace-language'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
import FormField from '../../components/ui/FormField.vue'
import PasswordField from '../../components/ui/PasswordField.vue'
import ProfilePhotoCrop from '../../components/profile/ProfilePhotoCrop.vue'

const auth = useAuthStore()
const user = computed(() => auth.user)
const capabilities = computed(() => auth.user?.capabilities)
const name = ref(auth.user?.name ?? '')
const nameError = ref('')
const nameBusy = ref(false)
const photoPreview = ref('')
const photoUrl = ref('')
const photoInput = ref<HTMLInputElement>()
const photoError = ref('')
const photoBusy = ref(false)
const email = ref('')
const emailError = ref('')
const emailBusy = ref(false)
const emailFields = ref<Record<string, string>>({})
const pendingEmail = ref('')
const expiresAt = ref(0)
const resendAt = ref(0)
const passwordNew = ref('')
const passwordConfirm = ref('')
const passwordError = ref('')
const passwordFields = ref<Record<string, string>>({})
const passwordBusy = ref(false)
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
let privatePhotoObjectUrl = ''
let photoRequest = 0

const initials = computed(() => (user.value?.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') ?? ''))
const resendSeconds = computed(() => Math.max(0, Math.ceil((resendAt.value - now.value) / 1000)))
const pendingExpired = computed(() => expiresAt.value > 0 && now.value >= expiresAt.value)

function applyUser(next: NonNullable<typeof auth.user>) {
  auth.setUser(next)
  name.value = next.name
}

function expireSession(cause: unknown) {
  if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
}

async function loadPhoto() {
  const request = ++photoRequest
  const current = auth.user
  photoUrl.value = ''
  if (privatePhotoObjectUrl) URL.revokeObjectURL(privatePhotoObjectUrl)
  privatePhotoObjectUrl = ''
  const url = current?.photo_url
  if (!url) return
  let privateRoute = false
  try {
    privateRoute = new URL(url).pathname.endsWith('/api/v1/me/photo')
  } catch {
    photoUrl.value = url
    return
  }
  if (!privateRoute) {
    photoUrl.value = url
    return
  }
  try {
    const blob = await accountApi.photo()
    if (request !== photoRequest || auth.user?.guid !== current?.guid) return
    privatePhotoObjectUrl = URL.createObjectURL(blob)
    photoUrl.value = privatePhotoObjectUrl
  } catch (cause) {
    if (request === photoRequest && auth.user?.guid === current?.guid) {
      photoError.value = t('Foto profil belum dapat dimuat.')
      expireSession(cause)
    }
  }
}

function checkPhoto(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || photoBusy.value) return
  photoError.value = ''
  if (!validProfilePhoto(file)) {
    photoError.value = t('Pilih JPG, PNG, atau WebP maksimal 8 MB.')
    return
  }
  clearPhotoSelection()
  photoPreview.value = URL.createObjectURL(file)
}

function clearPhotoSelection() {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
  photoPreview.value = ''
  if (photoInput.value) photoInput.value.value = ''
}

async function saveName() {
  if (nameBusy.value || !name.value.trim()) return
  nameBusy.value = true
  nameError.value = ''
  try {
    applyUser(await accountApi.updateName(name.value.trim()))
    notify.success(t('Nama profil berhasil diperbarui.'))
  } catch (cause) {
    nameError.value = t(workspaceError(cause).fields.name || workspaceError(cause).message)
    expireSession(cause)
  } finally {
    nameBusy.value = false
  }
}

async function uploadPhoto(file: File) {
  if (photoBusy.value) return
  photoBusy.value = true
  photoError.value = ''
  try {
    applyUser(await accountApi.uploadPhoto(file))
    clearPhotoSelection()
    await loadPhoto()
    notify.success(t('Foto profil berhasil diperbarui.'))
  } catch (cause) {
    photoError.value = t(workspaceError(cause).fields.photo || workspaceError(cause).message)
    expireSession(cause)
  } finally {
    photoBusy.value = false
  }
}

async function deletePhoto() {
  if (photoBusy.value || !(await confirmAction(t('Hapus foto profil?'), {
    title: t('Hapus foto profil'), action: t('Hapus'), danger: true,
  }))) return
  photoBusy.value = true
  photoError.value = ''
  try {
    applyUser(await accountApi.deletePhoto())
    clearPhotoSelection()
    await loadPhoto()
    notify.success(t('Foto profil berhasil dihapus.'))
  } catch (cause) {
    photoError.value = t(workspaceError(cause).message)
    expireSession(cause)
    await auth.refresh()
    await loadPhoto()
  } finally {
    photoBusy.value = false
  }
}

async function requestEmailChange() {
  if (!email.value.trim() || emailBusy.value || resendSeconds.value > 0) return
  emailBusy.value = true
  emailError.value = ''
  emailFields.value = {}
  try {
    const result = await accountApi.requestEmailChange(email.value.trim())
    pendingEmail.value = email.value.trim()
    expiresAt.value = now.value + result.expires_in * 1000
    resendAt.value = now.value + result.resend_after * 1000
    notify.success(t('Permintaan perubahan email diterima. Periksa inbox email baru untuk tautan verifikasi.'))
  } catch (cause) {
    const feedback = workspaceError(cause)
    emailError.value = t(axios.isAxiosError(cause) && cause.response?.status === 403
      ? 'Email tidak dapat diubah dengan metode masuk akun ini.'
      : feedback.message)
    emailFields.value = feedback.fields
    expireSession(cause)
    if (axios.isAxiosError(cause) && cause.response?.status === 429) {
      const retryAfter = Number(cause.response.headers['retry-after']) || 60
      resendAt.value = now.value + retryAfter * 1000
    }
  } finally {
    emailBusy.value = false
  }
}

async function changePassword() {
  if (passwordBusy.value || !passwordNew.value || passwordNew.value !== passwordConfirm.value) return
  passwordBusy.value = true
  passwordError.value = ''
  passwordFields.value = {}
  try {
    applyUser(await accountApi.changePassword(passwordNew.value, passwordConfirm.value))
    passwordNew.value = ''
    passwordConfirm.value = ''
    notify.success(t('Kata sandi berhasil diperbarui.'))
  } catch (cause) {
    const feedback = workspaceError(cause)
    passwordError.value = t(axios.isAxiosError(cause) && cause.response?.status === 503
      ? 'Perubahan kata sandi belum dapat diproses saat ini.'
      : axios.isAxiosError(cause) && cause.response?.status === 403
        ? 'Akun ini tidak dapat mengubah kata sandi.'
        : feedback.message)
    passwordFields.value = feedback.fields
    expireSession(cause)
  } finally {
    passwordBusy.value = false
  }
}

onMounted(() => {
  void loadPhoto()
  clock = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => {
  clearInterval(clock)
  photoRequest++
  if (privatePhotoObjectUrl) URL.revokeObjectURL(privatePhotoObjectUrl)
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
})
</script>

<template>
  <div class="mb-7">
    <p class="mb-2 text-xs font-semibold tracking-[0.16em] text-primary">{{ t('Profil akun') }}</p>
    <h1 class="text-3xl font-semibold">{{ t('Profil dan akun') }}</h1>
    <p class="mt-3 text-sm text-muted">{{ t('Kelola informasi profil dan pengaturan keamanan akun.') }}</p>
  </div>

  <p v-if="authMode !== 'api'" class="rounded-xl border border-line bg-white p-5 text-sm text-muted">{{ t('Pengaturan akun tersedia saat workspace tersambung ke API.') }}</p>
  <div v-else class="grid gap-5 xl:grid-cols-2">
    <FeedbackMessage v-if="auth.sessionError" class="xl:col-span-2" :message="t(auth.sessionError)" error />
    <section class="rounded-2xl border border-line bg-white p-5 sm:p-7">
      <h2 class="text-xl font-semibold">{{ t('Informasi profil') }}</h2>
      <p class="mt-2 text-sm text-muted">{{ t('Metode masuk') }}: <span v-if="user?.login_methods?.length">{{ user.login_methods.map((method) => method === 'google' ? 'Google' : t('Email & Kata Sandi')).join(', ') }}</span><span v-else>{{ t('Belum tersedia') }}</span></p>
      <div class="mt-5 flex flex-wrap items-center gap-4 border-y border-line py-5">
        <span class="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full bg-sage text-xl font-semibold text-primary">
          <img v-if="photoUrl" :src="photoUrl" :alt="t('Foto profil')" class="size-full object-cover" />
          <span v-else>{{ initials }}</span>
        </span>
        <div class="min-w-0 flex-1">
          <label for="profile-photo" class="mb-2 block text-xs font-semibold">{{ t('Foto profil') }}</label>
          <input id="profile-photo" ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" class="block w-full text-sm text-muted file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-sage file:px-3 file:text-sm file:font-semibold file:text-primary" :disabled="!capabilities?.can_change_photo || photoBusy" @change="checkPhoto" />
          <p class="mt-2 text-xs text-muted">{{ t('JPG, PNG, atau WebP · Maks. 8 MB') }}</p>
        </div>
      </div>
      <FeedbackMessage :message="t(photoError)" error />
      <ProfilePhotoCrop v-if="photoPreview" :src="photoPreview" :busy="photoBusy" :error="photoError" @save="uploadPhoto" @close="clearPhotoSelection" />
      <button v-if="user?.photo_url && capabilities?.can_change_photo" type="button" class="mt-3 min-h-10 text-sm font-semibold text-error underline disabled:cursor-not-allowed disabled:opacity-50" :disabled="photoBusy" @click="deletePhoto">{{ t('Hapus foto') }}</button>

      <form class="mt-6 border-t border-line pt-5" @submit.prevent="saveName">
        <FormField id="profile-name" v-model="name" :label="t('Nama')" :maxlength="255" :error="nameError" :disabled="!capabilities?.can_change_name || nameBusy" />
        <button type="submit" class="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="!capabilities?.can_change_name || nameBusy || name.trim() === user?.name">{{ nameBusy ? t('Menyimpan…') : t('Simpan nama') }}</button>
      </form>
    </section>

    <section class="rounded-2xl border border-line bg-white p-5 sm:p-7">
      <h2 class="text-xl font-semibold">{{ t('Email akun') }}</h2>
      <p class="mt-2 break-words text-sm"><strong>{{ t('Email aktif') }}:</strong> {{ user?.email }}</p>
      <p v-if="!capabilities?.can_change_email" class="mt-3 rounded-xl bg-soft p-4 text-sm leading-6 text-muted">{{ user?.login_methods?.includes('google') ? t('Email dikelola oleh akun Google dan tidak dapat diubah dari sini.') : t('Email tidak dapat diubah dengan metode masuk akun ini.') }}</p>
      <form v-else class="mt-5" @submit.prevent="requestEmailChange">
        <FeedbackMessage :message="emailError" error />
        <FormField id="new-account-email" v-model="email" :label="t('Email baru')" type="email" autocomplete="email" :error="emailFields.email" :disabled="emailBusy || resendSeconds > 0" />
        <p v-if="pendingEmail" class="mb-4 rounded-xl bg-sage/70 p-4 text-sm leading-6">
          <strong>{{ pendingExpired ? t('Tautan verifikasi mungkin sudah kedaluwarsa.') : t('Menunggu verifikasi') }}</strong><br />
          {{ t('Permintaan perubahan email menunggu verifikasi di :email. Email lama tetap aktif sampai verifikasi selesai.', { email: pendingEmail }) }}
          <span v-if="resendSeconds">{{ t(' Kirim ulang tersedia dalam :seconds detik.', { seconds: resendSeconds }) }}</span>
        </p>
        <button type="submit" class="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="emailBusy || resendSeconds > 0 || !email.trim()">
          {{ emailBusy ? t('Mengirim…') : pendingEmail ? (resendSeconds ? t('Tunggu :seconds detik', { seconds: resendSeconds }) : t('Kirim ulang verifikasi')) : t('Minta perubahan email') }}
        </button>
      </form>

      <form v-if="capabilities?.can_change_password" class="mt-7 border-t border-line pt-5" @submit.prevent="changePassword">
        <h2 class="text-xl font-semibold">{{ t('Ubah kata sandi') }}</h2>
        <p class="my-3 rounded-xl bg-soft p-4 text-sm leading-6 text-muted">{{ t('Setelah kata sandi diperbarui, perangkat lain akan keluar. Perangkat ini tetap dapat digunakan.') }}</p>
        <FeedbackMessage :message="passwordError" error />
        <PasswordField id="password-new" v-model="passwordNew" :label="t('Kata sandi baru')" autocomplete="new-password" :error="passwordFields.password" :disabled="passwordBusy" />
        <PasswordField id="password-confirm" v-model="passwordConfirm" :label="t('Ulangi kata sandi baru')" autocomplete="new-password" :error="passwordFields.password_confirmation" :disabled="passwordBusy" />
        <p v-if="passwordConfirm && passwordNew !== passwordConfirm" class="mb-3 text-xs text-error">{{ t('Konfirmasi kata sandi belum sama.') }}</p>
        <button type="submit" class="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="passwordBusy || !passwordNew || passwordNew !== passwordConfirm">{{ passwordBusy ? t('Menyimpan…') : t('Perbarui kata sandi') }}</button>
      </form>
    </section>
  </div>
</template>

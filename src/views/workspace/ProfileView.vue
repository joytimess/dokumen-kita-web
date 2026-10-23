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
const photoFilename = ref('')
const photoUrl = ref('')
const photoInput = ref<HTMLInputElement>()
const photoError = ref('')
const photoBusy = ref(false)
const emailExpanded = ref(false)
const passwordExpanded = ref(false)
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
  photoFilename.value = file.name
}

function clearPhotoSelection() {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value)
  photoPreview.value = ''
  photoFilename.value = ''
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
  <div class="profile-page space-y-6 text-ink">
    <header>
      <p class="mb-2 text-xs font-semibold tracking-[0.16em] text-primary">{{ t('Profil akun') }}</p>
      <h1 class="text-3xl font-bold tracking-tight min-[600px]:text-4xl">{{ t('Profil dan akun') }}</h1>
      <p class="mt-3 text-[15px] leading-6 text-muted">{{ t('Kelola informasi profil dan pengaturan keamanan akun.') }}</p>
    </header>

    <p v-if="authMode !== 'api'" class="rounded-xl border border-line bg-white p-5 text-sm text-muted">{{ t('Pengaturan akun tersedia saat workspace tersambung ke API.') }}</p>
    <template v-else>
      <FeedbackMessage v-if="auth.sessionError" :message="t(auth.sessionError)" error />
      <section aria-labelledby="profile-identity-title" class="min-w-0 rounded-3xl border border-line bg-white p-5 sm:p-7">
        <div class="flex flex-col gap-5 min-[600px]:flex-row min-[600px]:items-center">
          <span class="grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-sage text-2xl font-semibold text-primary">
            <img v-if="photoUrl" :src="photoUrl" :alt="t('Foto profil')" class="size-full object-cover" />
            <span v-else>{{ initials }}</span>
          </span>
          <div class="min-w-0 flex-1">
            <h2 id="profile-identity-title" class="text-xl font-bold wrap-anywhere">{{ user?.name }}</h2>
            <p class="mt-1 text-sm leading-6 text-muted wrap-anywhere">{{ user?.email }}</p>
            <span v-if="typeof user?.email_verified === 'boolean'" class="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" :class="user.email_verified ? 'bg-sage text-primary' : 'bg-soft text-muted'">
              <span class="material-symbols-outlined text-[16px]!" aria-hidden="true">{{ user.email_verified ? 'verified' : 'mail' }}</span>
              {{ user.email_verified ? t('Terverifikasi') : t('Belum diverifikasi') }}
            </span>
          </div>
          <div class="flex min-w-0 flex-col items-start gap-2 min-[600px]:max-w-56 min-[600px]:items-end">
            <input id="profile-photo" ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" :aria-label="t('Foto profil')" aria-describedby="profile-photo-hint" class="hidden" :disabled="!capabilities?.can_change_photo || photoBusy" @change="checkPhoto" />
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button type="button" class="profile-secondary inline-flex items-center gap-2" aria-describedby="profile-photo-hint" :disabled="!capabilities?.can_change_photo || photoBusy" @click="photoInput?.click()">
                <span class="material-symbols-outlined text-[18px]!" aria-hidden="true">photo_camera</span>{{ t('Ubah foto') }}
              </button>
              <button v-if="user?.photo_url && capabilities?.can_change_photo" type="button" class="grid size-11 place-items-center rounded-lg text-error hover:bg-error/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-error disabled:cursor-not-allowed disabled:opacity-50" :aria-label="t('Hapus foto')" :title="t('Hapus foto')" :disabled="photoBusy" @click="deletePhoto">
                <span class="material-symbols-outlined text-[20px]!" aria-hidden="true">delete</span>
              </button>
            </div>
            <p id="profile-photo-hint" class="mt-2 text-xs leading-5 text-muted">{{ t('JPG, PNG, atau WebP · Maks. 8 MB') }}</p>
          </div>
        </div>
        <FeedbackMessage v-if="!photoPreview" class="mt-4 mb-0!" :message="t(photoError)" error />
      </section>
      <ProfilePhotoCrop v-if="photoPreview" :src="photoPreview" :filename="photoFilename" :busy="photoBusy" :error="photoError" @save="uploadPhoto" @close="clearPhotoSelection" />

      <div class="grid items-start gap-5 min-[900px]:grid-cols-2">
        <section aria-labelledby="profile-info-title" class="min-w-0 rounded-3xl border border-line bg-white p-5 sm:p-7">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined rounded-xl bg-sage p-2.5 text-primary" aria-hidden="true">person</span>
            <div class="min-w-0">
              <h2 id="profile-info-title" class="text-lg font-bold">{{ t('Informasi profil') }}</h2>
              <p class="mt-1 text-sm leading-6 text-muted">{{ t('Kelola nama yang ditampilkan pada profil Anda.') }}</p>
            </div>
          </div>
          <form class="profile-name-form mt-6" @submit.prevent="saveName">
            <FormField id="profile-name" v-model="name" class="mb-3.5!" :label="t('Nama')" :maxlength="255" :error="nameError" :disabled="!capabilities?.can_change_name || nameBusy" />
            <button type="submit" class="min-h-11 rounded-[10px] bg-primary px-4 text-sm font-bold text-white transition-colors hover:bg-[#174c39] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-not-allowed disabled:bg-[#6e9c8b] disabled:opacity-70 motion-reduce:transition-none" :disabled="!capabilities?.can_change_name || nameBusy || !name.trim() || name.trim() === user?.name">{{ nameBusy ? t('Menyimpan…') : t('Simpan perubahan') }}</button>
          </form>
        </section>

        <section aria-labelledby="profile-email-title" class="min-w-0 rounded-3xl border border-line bg-white p-5 sm:p-7">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined rounded-xl bg-sage p-2.5 text-primary" aria-hidden="true">shield</span>
            <div class="min-w-0">
              <h2 id="profile-email-title" class="text-lg font-bold">{{ t('Keamanan akun') }}</h2>
              <p class="mt-1 text-sm leading-6 text-muted">{{ t('Kelola metode masuk dan alamat email akun Anda.') }}</p>
            </div>
          </div>
          <dl class="mt-6 space-y-4 text-sm">
            <div>
              <dt class="text-xs font-semibold text-muted">{{ t('Metode masuk') }}</dt>
              <dd class="mt-1 font-medium"><span v-if="user?.login_methods?.length">{{ user.login_methods.map((method) => method === 'google' ? 'Google' : t('Email & Kata Sandi')).join(', ') }}</span><span v-else>{{ t('Belum tersedia') }}</span></dd>
            </div>
            <div>
              <dt class="text-xs font-semibold text-muted">{{ t('Email aktif') }}</dt>
              <dd class="mt-1 leading-6 wrap-anywhere">{{ user?.email }}</dd>
            </div>
          </dl>
          <p v-if="!capabilities?.can_change_email" class="mt-5 rounded-xl bg-soft p-4 text-sm leading-6 text-muted">{{ user?.login_methods?.includes('google') ? t('Email akun ini dikelola melalui Google dan tidak dapat diubah dari Dokumen-Kita.') : t('Email tidak dapat diubah dengan metode masuk akun ini.') }}</p>
          <template v-else>
            <button type="button" class="profile-secondary mt-5" aria-controls="profile-email-form" :aria-expanded="emailExpanded" :disabled="emailBusy" @click="emailExpanded = !emailExpanded">{{ emailExpanded ? t('Tutup pengaturan email') : t('Ubah email') }}</button>
            <form id="profile-email-form" v-show="emailExpanded" class="mt-5" @submit.prevent="requestEmailChange">
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
          </template>
        </section>
      </div>

      <section v-if="capabilities?.can_change_password" aria-labelledby="profile-password-title" class="min-w-0 rounded-3xl border border-line bg-white p-5 sm:p-7">
        <div class="flex flex-col gap-4 min-[600px]:flex-row min-[600px]:items-center min-[600px]:justify-between">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined rounded-xl bg-sage p-2.5 text-primary" aria-hidden="true">lock</span>
            <div class="min-w-0">
              <h2 id="profile-password-title" class="text-lg font-bold">{{ t('Kata sandi') }}</h2>
              <p class="mt-1 text-sm leading-6 text-muted">{{ t('Kelola keamanan masuk ke akun Anda.') }}</p>
            </div>
          </div>
          <button type="button" class="profile-secondary self-start min-[600px]:self-auto" aria-controls="profile-password-form" :aria-expanded="passwordExpanded" :disabled="passwordBusy" @click="passwordExpanded = !passwordExpanded">{{ passwordExpanded ? t('Tutup pengaturan kata sandi') : t('Ubah kata sandi') }}</button>
        </div>
        <Transition name="password-expand">
          <div v-show="passwordExpanded" class="password-expand w-full" :inert="!passwordExpanded || undefined">
            <div class="password-expand-content min-h-0">
              <form id="profile-password-form" class="mt-6 w-full min-w-0 border-t border-line pt-5" @submit.prevent="changePassword">
                <p class="my-3 w-full rounded-xl bg-soft p-4 text-sm leading-6 text-muted">{{ t('Setelah kata sandi diperbarui, perangkat lain akan keluar. Perangkat ini tetap dapat digunakan.') }}</p>
                <FeedbackMessage :message="passwordError" error />
                <PasswordField id="password-new" v-model="passwordNew" class="w-full" :label="t('Kata sandi baru')" autocomplete="new-password" :error="passwordFields.password" :disabled="passwordBusy" />
                <PasswordField id="password-confirm" v-model="passwordConfirm" class="w-full" :label="t('Ulangi kata sandi baru')" autocomplete="new-password" :error="passwordFields.password_confirmation" :disabled="passwordBusy" />
                <p v-if="passwordConfirm && passwordNew !== passwordConfirm" class="mb-3 text-xs text-error">{{ t('Konfirmasi kata sandi belum sama.') }}</p>
                <button type="submit" class="min-h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="passwordBusy || !passwordNew || passwordNew !== passwordConfirm">{{ passwordBusy ? t('Menyimpan…') : t('Perbarui kata sandi') }}</button>
              </form>
            </div>
          </div>
        </Transition>
      </section>
    </template>
  </div>
</template>


<style scoped>
.profile-page {
  --color-ink: #111827;
  --color-muted: #6b7280;
  --color-line: #e5e7eb;
  --color-soft: #f4f5ee;
  --color-sage: #eaf0e6;
  --color-error: #9b3d35;
}
.profile-name-form :deep(label) { font-size: 13px; font-weight: 700; }
.profile-name-form :deep(input) { min-height: 44px; border-radius: 10px; padding-inline: 14px; }
.profile-name-form :deep(input:focus-visible) { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.profile-name-form :deep(input:disabled) { cursor: not-allowed; opacity: 0.6; }
.profile-secondary {
  min-height: 44px;
  border: 1px solid var(--color-line);
  border-radius: 10px;
  padding: 8px 14px;
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 600;
}
.profile-secondary:hover:not(:disabled) { background: var(--color-sage); }
.profile-secondary:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.profile-secondary:disabled { cursor: not-allowed; opacity: 0.5; }
.password-expand { display: grid; grid-template-rows: 1fr; }
.password-expand-enter-active { transition: grid-template-rows 180ms ease-out, opacity 180ms ease-out; }
.password-expand-leave-active { transition: grid-template-rows 180ms ease-in, opacity 180ms ease-in; }
.password-expand-enter-from,
.password-expand-leave-to { grid-template-rows: 0fr; opacity: 0; }
.password-expand-enter-active > .password-expand-content,
.password-expand-leave-active > .password-expand-content { overflow: hidden; }
@media (prefers-reduced-motion: reduce) {
  .password-expand-enter-active,
  .password-expand-leave-active { transition: none; }
}
</style>

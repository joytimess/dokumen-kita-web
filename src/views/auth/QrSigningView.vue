<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { signingQrApi } from '../../services/signing-qr.service'
import { authApi } from '../../services/auth.service'
import { authMode } from '../../services/http'
import { workspaceError } from '../../services/workspace.errors'
import { pendingSigningQr, clearSigningQr, signingQrToken, qrStatusLabel } from '../../utils/signingQr'
import { afterAuthentication } from '../../utils/authRedirect'
import AuthLayout from '../../layouts/AuthLayout.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
const auth = useAuthStore(), route = useRoute(), router = useRouter()
const busy = ref(false), status = ref(''), error = ref('')
let active = true
function closeContext(state: string) {
  if (['invalid', 'revoked', 'superseded', 'draft', 'finalizing', 'completed', 'already_signed'].includes(state)) clearSigningQr()
}
const canAuthenticate = computed(() => status.value === 'active' && !auth.user && !auth.sessionError)
async function resolve() {
  if (busy.value) return
  const token = pendingSigningQr()
  busy.value = true
  error.value = ''
  try {
    if (!token || route.query.error === 'invalid') { status.value = 'invalid'; return }
    if (authMode !== 'api') { error.value = 'QR Signing memerlukan koneksi API aktif.'; return }
    const result = await signingQrApi.resolve(token)
    if (!active || token !== pendingSigningQr()) return
    status.value = result.status
    closeContext(result.status)
    if (result.status !== 'active') return
    if (auth.sessionError) await auth.refresh()
    else await auth.restore()
    if (!active || token !== pendingSigningQr()) return
    if (auth.sessionError) { error.value = auth.sessionError; return }
    if (!auth.user) return
    if (!auth.user.email_verified) { await router.replace(afterAuthentication(false, '/sign/qr')); return }
    const claim = await signingQrApi.claim(token)
    if (!active || token !== pendingSigningQr()) return
    status.value = claim.status
    closeContext(claim.status)
    if (claim.status === 'active' && claim.document_guid && claim.version_guid && claim.assignment_guid) {
      clearSigningQr()
      await router.replace(`/documents/${claim.document_guid}/versions/${claim.version_guid}/view`)
    }
  } catch (cause) {
    const failure = workspaceError(cause)
    if (failure.status === 401) { auth.user = null; status.value = 'active' }
    else if (failure.status === 422) { status.value = 'invalid'; clearSigningQr() }
    else error.value = failure.message
  } finally {
    busy.value = false
    if (active && pendingSigningQr() && token !== pendingSigningQr()) void resolve()
  }
}
async function google() {
  if (busy.value) return
  busy.value = true
  try { await authApi.google('/sign/qr') }
  catch { busy.value = false; error.value = 'Masuk dengan Google belum dapat diproses. Coba lagi.' }
}
async function switchAccount() {
  if (busy.value) return
  busy.value = true
  try { await auth.logout(); status.value = 'active'; error.value = '' }
  catch (cause) { error.value = workspaceError(cause).message }
  finally { busy.value = false }
}
function restoreAfterNavigation(event: PageTransitionEvent) { if (event.persisted) busy.value = false }
onMounted(() => { window.addEventListener('pageshow', restoreAfterNavigation); void resolve() })
watch([signingQrToken, () => route.query.error], ([token, invalid]) => {
  if (!active) return
  if (invalid === 'invalid') status.value = 'invalid'
  else if (token) void resolve()
})
onUnmounted(() => { active = false; window.removeEventListener('pageshow', restoreAfterNavigation) })
</script>
<template>
  <AuthLayout compact>
    <p class="mb-4 text-xs font-semibold tracking-widest text-primary">QR CODE SIGNING</p>
    <h1>Lanjutkan penandatanganan dokumen.</h1>
    <p class="mt-3 text-sm text-muted">Masuk menggunakan email penandatangan yang terverifikasi. Anda tetap perlu membaca dokumen dan mengonfirmasi tanda tangan.</p>
    <FeedbackMessage :message="error" error />
    <p v-if="busy" role="status" class="my-5 text-sm">Memeriksa akses QR…</p>
    <p v-else-if="status" role="status" class="my-5 text-sm">{{ qrStatusLabel(status) }}</p>
    <div v-if="canAuthenticate" class="mt-5 flex flex-col gap-3">
      <BaseButton :loading="busy" @click="google">Continue with Google</BaseButton>
      <RouterLink :to="{ path: '/login', query: { redirect: '/sign/qr' } }" class="inline-flex min-h-12 items-center justify-center rounded-lg border border-line px-4 text-primary">Login email/password</RouterLink>
      <RouterLink :to="{ path: '/register', query: { redirect: '/sign/qr' } }" class="py-3 text-center text-primary underline">Belum punya akun? Register</RouterLink>
    </div>
    <BaseButton v-if="!canAuthenticate && (error || status === 'waiting')" :loading="busy" class="mt-5" @click="resolve">Periksa kembali</BaseButton>
    <BaseButton v-if="auth.user && status === 'not_assigned'" :loading="busy" class="mt-5" @click="switchAccount">Keluar dan gunakan akun penerima</BaseButton>
  </AuthLayout>
</template>

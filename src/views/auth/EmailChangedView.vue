<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { t } from '../../services/workspace-language'
import AuthLayout from '../../layouts/AuthLayout.vue'

const route = useRoute()
const auth = useAuthStore()
const status = computed(() => typeof route.query.status === 'string' ? route.query.status : '')
const refreshing = ref(false)
const refreshError = ref('')

onMounted(async () => {
  if (status.value !== 'verified') return
  await auth.restore()
  if (!auth.user) return
  refreshing.value = true
  await auth.refresh()
  refreshError.value = auth.sessionError
  refreshing.value = false
})
</script>

<template>
  <AuthLayout compact>
  <section class="w-full rounded-2xl border border-line bg-white p-6 text-center shadow-sm sm:p-8">
    <span class="material-symbols-outlined text-4xl" :class="status === 'verified' ? 'text-primary' : 'text-error'" aria-hidden="true">{{ status === 'verified' ? 'mark_email_read' : 'error' }}</span>
    <h1 class="mt-3 text-2xl font-semibold">{{ status === 'verified' ? t('Email berhasil diperbarui') : t('Tautan perubahan email tidak berlaku') }}</h1>
    <p v-if="status === 'verified'" class="mt-3 text-sm leading-6 text-muted">{{ t('Alamat email akun sudah diverifikasi dan diperbarui.') }}</p>
    <p v-else class="mt-3 text-sm leading-6 text-muted">{{ t('Tautan mungkin sudah kedaluwarsa, pernah digunakan, atau digantikan oleh permintaan baru.') }}</p>
    <p v-if="refreshing" role="status" class="mt-4 text-sm text-muted">{{ t('Memperbarui informasi akun…') }}</p>
    <p v-if="refreshError" class="mt-4 text-sm text-error">{{ t('Email sudah diverifikasi, tetapi profil belum dapat dimuat ulang.') }}</p>
    <div class="mt-6 flex flex-wrap justify-center gap-3">
      <RouterLink v-if="auth.user" to="/profile" class="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white">{{ t('Kembali ke profil') }}</RouterLink>
      <RouterLink v-else to="/login" class="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white">{{ t('Masuk') }}</RouterLink>
      <RouterLink to="/" class="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-semibold text-ink">{{ t('Kembali ke beranda') }}</RouterLink>
    </div>
  </section>
  </AuthLayout>
</template>

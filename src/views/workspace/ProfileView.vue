<script setup lang="ts">
import { useAuthStore } from '../../stores/auth'
import { t } from '../../services/workspace-language'
const auth = useAuthStore()
</script>

<template>
  <section class="max-w-2xl rounded-2xl border border-line bg-white p-6 sm:p-8">
    <p class="mb-3 text-xs font-semibold tracking-[0.16em] text-primary">{{ t('Profil akun') }}</p>
    <h1 class="text-3xl font-semibold">{{ t('Profil') }}</h1>
    <p class="mt-3 text-sm text-muted">{{ t('Pengaturan profil belum tersedia.') }}</p>
    <dl class="mt-8 grid gap-5 border-t border-line pt-6 sm:grid-cols-2">
      <div class="min-w-0">
        <dt class="text-xs font-semibold uppercase tracking-wide text-muted">{{ t('Nama') }}</dt>
        <dd class="mt-2 wrap-anywhere font-medium">{{ auth.user?.name }}</dd>
      </div>
      <div class="min-w-0">
        <dt class="text-xs font-semibold uppercase tracking-wide text-muted">{{ t('Email') }}</dt>
        <dd class="mt-2 wrap-anywhere font-medium">{{ auth.user?.email }}</dd>
      </div>
    </dl>
  </section>
</template>

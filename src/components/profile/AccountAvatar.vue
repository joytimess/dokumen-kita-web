<script setup lang="ts">
import { useAuthStore } from '../../stores/auth'
import { t } from '../../services/workspace-language'

const auth = useAuthStore()
function finishLoading(event: Event) {
  if ((event.target as HTMLImageElement).getAttribute('src') !== auth.photoSrc) return
  auth.photoLoaded = event.type === 'load'
  auth.photoFailed = event.type === 'error'
}
</script>

<template>
  <span class="grid shrink-0 place-items-center overflow-hidden rounded-full bg-sage font-semibold text-primary">
    <img v-if="auth.photoSrc && !auth.photoFailed" :key="auth.photoSrc" :src="auth.photoSrc" :alt="t('Foto profil')" class="size-full rounded-full object-cover" :class="{ invisible: !auth.photoLoaded }" @load="finishLoading" @error="finishLoading" />
    <slot v-else-if="!auth.user?.photo_url || auth.photoFailed" />
  </span>
</template>

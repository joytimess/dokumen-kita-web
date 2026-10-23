<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { accountApi } from '../../services/account.service'
import { t } from '../../services/workspace-language'

const auth = useAuthStore()
const src = ref('')
let objectUrl = ''
let request = 0
function release() {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
  objectUrl = ''
}
watch(() => auth.user, async (user) => {
  const current = ++request
  release()
  src.value = ''
  if (!user?.photo_url) return
  try {
    if (new URL(user.photo_url, location.origin).pathname.endsWith('/api/v1/me/photo')) {
      const blob = await accountApi.photo()
      if (current !== request) return
      objectUrl = URL.createObjectURL(blob)
      src.value = objectUrl
    } else src.value = user.photo_url
  } catch {
    // Keep the initials fallback when the authenticated photo cannot be loaded.
  }
}, { immediate: true })
onUnmounted(() => { request++; release() })
</script>

<template>
  <span class="grid shrink-0 place-items-center overflow-hidden rounded-full bg-sage font-semibold text-primary">
    <img v-if="src" :src="src" :alt="t('Foto profil')" class="size-full rounded-full object-cover" />
    <slot v-else />
  </span>
</template>

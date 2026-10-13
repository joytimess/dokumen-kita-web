<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
onMounted(() => {
  void useAuthStore().restore()
})
</script>
<template>
  <a class="fixed -top-24 left-4 z-100 bg-white p-3 text-primary focus:top-3" href="#main"
    >Lewati ke konten</a
  ><RouterView />
</template>

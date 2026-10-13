<script setup lang="ts">
defineProps<{ message: string; error?: boolean }>()
</script>
<template>
  <div
    v-if="message"
    class="mb-5 rounded-[7px] border px-[15px] py-[13px] text-xs wrap-anywhere"
    :class="
      error
        ? 'border-[#e8c4bf] bg-[#fff3f1] text-error'
        : 'border-[#c8d9bc] bg-[#f1f6ed] text-primary'
    "
    :role="error ? 'alert' : 'status'"
  >
    {{ message }}
  </div>
</template>

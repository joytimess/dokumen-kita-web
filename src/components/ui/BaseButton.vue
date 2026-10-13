<script setup lang="ts">
withDefaults(defineProps<{ loading?: boolean; type?: 'submit' | 'button' }>(), { type: 'button' })
</script>
<template>
  <button
    :type="type"
    class="inline-flex min-h-12 items-center justify-center gap-5 rounded-[7px] border border-primary bg-primary px-6 py-3 text-center text-sm font-semibold leading-normal text-white! hover:bg-[#174c39] hover:no-underline! disabled:cursor-wait disabled:opacity-65"
    :disabled="loading"
    :aria-busy="loading"
  >
    <span
      v-if="loading"
      class="size-[15px] animate-spin rounded-full border-2 border-white/35 border-t-white motion-reduce:animate-none"
      aria-hidden="true"
    ></span
    ><slot />
  </button>
</template>

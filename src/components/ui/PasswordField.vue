<script setup lang="ts">
import { ref } from 'vue'
defineProps<{
  id: string
  label: string
  autocomplete: string
  placeholder?: string
  error?: string
  hint?: string
  disabled?: boolean
}>()
const model = defineModel<string>({ required: true })
const visible = ref(false)
</script>
<template>
  <div
    class="mb-[18px] min-w-0 [&_label]:mb-[7px] [&_label]:block [&_label]:text-xs [&_label]:font-semibold [&_input]:min-h-[46px] [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-[7px] [&_input]:border [&_input]:border-line [&_input]:bg-white [&_input]:px-[13px] [&_input]:py-2.5 [&_input]:text-sm [&_input]:text-ink [&_input[aria-invalid=true]]:border-error"
  >
    <label :for="id">{{ label }}</label>
    <div class="relative [&_input]:pr-[52px]">
      <input
        :id="id"
        v-model="model"
        :name="id"
        :type="visible ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :placeholder="placeholder"
        :disabled="disabled"
        :aria-invalid="!!error"
        :aria-describedby="error ? `${id}-error` : hint ? `${id}-hint` : undefined"
        required
      /><button
        type="button"
        class="absolute inset-y-px right-px flex min-w-11 items-center justify-center rounded-[7px] bg-transparent text-muted transition-colors hover:text-primary motion-reduce:transition-none"
        :disabled="disabled"
        :aria-label="`${visible ? 'Sembunyikan' : 'Tampilkan'} ${label.toLowerCase()}`"
        :title="`${visible ? 'Sembunyikan' : 'Tampilkan'} ${label.toLowerCase()}`"
        :aria-pressed="visible"
        :aria-controls="id"
        @click="visible = !visible"
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          focusable="false"
        >
          <template v-if="visible">
            <path d="m3 3 18 18M10.58 10.58a2 2 0 0 0 2.84 2.84" />
            <path
              d="M9.88 5.09A10.94 10.94 0 0 1 12 5c7 0 10 7 10 7a13.31 13.31 0 0 1-3.16 4.19M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a10.8 10.8 0 0 0 5.39-1.61"
            />
          </template>
          <template v-else>
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z" />
            <circle cx="12" cy="12" r="3" />
          </template>
        </svg>
      </button>
    </div>
    <p v-if="hint" :id="`${id}-hint`" class="mt-1.5 text-[11px]" :class="error ? 'text-error' : 'text-muted'">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="mt-1.5 text-[11px] text-error">{{ error }}</p>
  </div>
</template>

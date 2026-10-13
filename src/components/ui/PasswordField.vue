<script setup lang="ts">
import { ref } from 'vue'
defineProps<{
  id: string
  label: string
  autocomplete: string
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
    <div
      class="relative [&_input]:pr-[110px] [&_button]:absolute [&_button]:inset-y-px [&_button]:right-px [&_button]:min-w-15 [&_button]:rounded-[7px] [&_button]:bg-transparent [&_button]:px-3 [&_button]:py-2.5 [&_button]:text-[10px] [&_button]:text-muted"
    >
      <input
        :id="id"
        v-model="model"
        :name="id"
        :type="visible ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :disabled="disabled"
        :aria-invalid="!!error"
        :aria-describedby="error ? `${id}-error` : hint ? `${id}-hint` : undefined"
        required
      /><button
        type="button"
        :disabled="disabled"
        :aria-label="`${visible ? 'Sembunyikan' : 'Lihat'} ${label.toLowerCase()}`"
        :aria-pressed="visible"
        :aria-controls="id"
        @click="visible = !visible"
      >
        {{ visible ? 'Sembunyikan' : 'Lihat' }}
      </button>
    </div>
    <p v-if="hint" :id="`${id}-hint`" class="mt-1.5 text-[11px] text-muted">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="mt-1.5 text-[11px] text-error">{{ error }}</p>
  </div>
</template>

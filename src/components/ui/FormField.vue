<script setup lang="ts">
withDefaults(
  defineProps<{
    id: string
    label: string
    type?: string
    autocomplete?: string
    placeholder?: string
    inputmode?: 'numeric' | 'email' | 'text'
    error?: string
    hint?: string
    maxlength?: number
    disabled?: boolean
  }>(),
  { type: 'text' },
)
const model = defineModel<string>({ required: true })
function pasteCode(event: ClipboardEvent) {
  const input = event.target as HTMLInputElement
  if (input.inputMode !== 'numeric') return
  const text = event.clipboardData?.getData('text').trim()
  if (text !== undefined) { event.preventDefault(); model.value = text.slice(0, 6) }
}
</script>
<template>
  <div
    class="mb-[18px] min-w-0 [&_label]:mb-[7px] [&_label]:block [&_label]:text-xs [&_label]:font-semibold [&_input]:min-h-[46px] [&_input]:w-full [&_input]:min-w-0 [&_input]:rounded-[7px] [&_input]:border [&_input]:border-line [&_input]:bg-white [&_input]:px-[13px] [&_input]:py-2.5 [&_input]:text-sm [&_input]:text-ink [&_input[aria-invalid=true]]:border-error"
  >
    <label :for="id">{{ label }}</label
    ><input
      :id="id"
      v-model="model"
      :name="id"
      :type="type"
      :autocomplete="autocomplete"
      :placeholder="placeholder"
      :inputmode="inputmode"
      @paste="pasteCode"
      :maxlength="maxlength"
      :disabled="disabled"
      :aria-invalid="!!error"
      :aria-describedby="error ? `${id}-error` : hint ? `${id}-hint` : undefined"
      required
    />
    <p v-if="hint" :id="`${id}-hint`" class="mt-1.5 text-[11px] text-muted">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="mt-1.5 text-[11px] text-error">{{ error }}</p>
  </div>
</template>

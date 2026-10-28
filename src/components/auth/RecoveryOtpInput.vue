<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ error?: string; disabled?: boolean }>()
const model = defineModel<string>({ required: true })
const input = ref<HTMLInputElement>()
const focused = ref(false)
const cursor = ref(0)

function syncCursor() {
  cursor.value = input.value?.selectionStart ?? 0
}
function update(event: Event) {
  const element = event.target as HTMLInputElement
  const position = element.selectionStart ?? element.value.length
  const before = element.value.slice(0, position).replace(/\D/g, '').length
  const value = element.value.replace(/\D/g, '').slice(0, 6)
  element.value = value
  model.value = value
  element.setSelectionRange(before, before)
  syncCursor()
}
function paste(event: ClipboardEvent) {
  const value = event.clipboardData?.getData('text')
  if (value === undefined) return
  event.preventDefault()
  model.value = value.replace(/\D/g, '').slice(0, 6)
  if (input.value) {
    input.value.value = model.value
    input.value.setSelectionRange(model.value.length, model.value.length)
    syncCursor()
  }
}
function selectBox(event: MouseEvent) {
  const element = input.value
  if (!element) return
  const bounds = element.getBoundingClientRect()
  const index = Math.max(0, Math.min(5, Math.floor((event.clientX - bounds.left) / (bounds.width / 6))))
  const position = Math.min(index, model.value.length)
  element.setSelectionRange(position, position)
  syncCursor()
}
</script>

<template>
  <div class="recovery-otp">
    <label for="recovery-otp">Kode OTP</label>
    <div class="recovery-otp-boxes" :class="{ 'is-disabled': disabled }">
      <span v-for="index in 6" :key="index" aria-hidden="true" class="recovery-otp-box"
        :class="{ 'is-active': focused && Math.min(cursor, 5) === index - 1, 'is-error': error }">{{ model[index - 1] || '' }}</span>
      <input id="recovery-otp" ref="input" :value="model" name="recovery-otp" type="text"
        inputmode="numeric" autocomplete="one-time-code" maxlength="6" :disabled="disabled"
        :aria-invalid="!!error" :aria-describedby="error ? 'recovery-otp-error' : 'recovery-otp-hint'" required
        @input="update" @paste="paste" @focus="focused = true; syncCursor()" @blur="focused = false"
        @select="syncCursor" @keyup="syncCursor" @click="selectBox" />
    </div>
    <p id="recovery-otp-hint" class="mt-1.5 text-[11px] text-muted">Kode berlaku selama 5 menit. Jangan bagikan kode kepada siapa pun.</p>
    <p v-if="error" id="recovery-otp-error" class="mt-1.5 text-[11px] text-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.recovery-otp { margin-bottom: 18px; min-width: 0; }
.recovery-otp label { display: block; margin-bottom: 7px; font-size: 0.75rem; font-weight: 600; }
.recovery-otp-boxes { position: relative; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
.recovery-otp-box { display: grid; min-width: 0; min-height: 46px; place-items: center; border: 1px solid var(--color-line); border-radius: 7px; background: white; color: var(--color-ink); font-size: 1.125rem; font-weight: 600; transition: border-color 150ms ease, box-shadow 150ms ease; }
.recovery-otp-box.is-active { border-color: var(--color-primary); box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent); }
.recovery-otp-box.is-error { border-color: var(--color-error); }
.recovery-otp-box.is-error.is-active { box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-error) 20%, transparent); }
.recovery-otp-boxes input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: text; }
.recovery-otp-boxes.is-disabled { opacity: .6; }
@media (prefers-reduced-motion: reduce) { .recovery-otp-box { transition: none; } }
</style>

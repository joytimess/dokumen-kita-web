<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { t } from '../../services/workspace-language'
import { RouterLink } from 'vue-router'
import { chatReferencePath } from '../../services/support-chat.service'
import type { SupportChatProps } from '../../types/support-chat'

const props = defineProps<SupportChatProps>()
const emit = defineEmits<{
  open: []
  close: []
  'update:draft': [value: string]
  send: [message?: string]
  retry: []
  'dismiss-invitation': []
}>()
const root = ref<HTMLElement>()
const panel = ref<HTMLElement>()
const launcher = ref<HTMLButtonElement>()
const composer = ref<HTMLTextAreaElement>()
const conversation = ref<HTMLElement>()
const mobile = ref(false)
const viewportStyle = ref<Record<string, string>>({})
const now = ref(Date.now())
const tooLong = computed(() => props.draft.length > 2000)
const waiting = computed(() => Math.max(0, Math.ceil(((props.error?.retryAt ?? 0) - now.value) / 1000)))
const canSend = computed(() => !!props.draft.trim() && !tooLong.value && !props.loading && !waiting.value && props.error?.kind !== 'unauthenticated')
const errorText = computed(() => {
  if (props.error?.kind === 'unauthenticated') return t('Sesi Anda berakhir. Silakan masuk kembali untuk menggunakan bantuan.')
  if (props.error?.kind === 'validation') return t('Pertanyaan belum dapat diterima. Periksa pesan Anda lalu kirim kembali.')
  if (props.error?.kind === 'rate-limit') return waiting.value
    ? t('Terlalu banyak permintaan. Coba lagi dalam :seconds detik.', { seconds: waiting.value })
    : t('Terlalu banyak permintaan. Silakan coba lagi.')
  return t('Bantuan belum dapat dihubungi. Pesan Anda tetap tersimpan. Silakan coba lagi.')
})
let retryTimer: ReturnType<typeof setInterval> | undefined
let previousOverflow: string | undefined
let inertElements: { element: HTMLElement; value: boolean }[] = []

function unlockBackground() {
  if (previousOverflow !== undefined) {
    document.body.style.overflow = previousOverflow
    previousOverflow = undefined
  }
  inertElements.forEach(({ element, value }) => { element.inert = value })
  inertElements = []
}

function lockBackground() {
  if (previousOverflow !== undefined) return
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  let current = root.value
  while (current?.parentElement) {
    for (const sibling of current.parentElement.children) {
      if (sibling === current || !(sibling instanceof HTMLElement)) continue
      inertElements.push({ element: sibling, value: sibling.inert })
      sibling.inert = true
    }
    if (current.parentElement === document.body) break
    current = current.parentElement
  }
}

function updateViewport() {
  mobile.value = window.matchMedia('(max-width: 599px)').matches
  const viewport = window.visualViewport
  viewportStyle.value = mobile.value && viewport ? {
    top: `${viewport.offsetTop}px`,
    left: `${viewport.offsetLeft}px`,
    width: `${viewport.width}px`,
    height: `${viewport.height}px`,
  } : {}
}

function send() {
  if (canSend.value) emit('send')
}

function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab' || !mobile.value) return
  const elements = Array.from(panel.value?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], textarea, [tabindex="0"]') ?? [])
  const first = elements[0]
  const last = elements[elements.length - 1]
  if (!elements.includes(document.activeElement as HTMLElement)) { event.preventDefault(); first?.focus() }
  else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}

function composerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
  event.preventDefault()
  send()
}

async function scrollLatest() {
  await nextTick()
  if (conversation.value) conversation.value.scrollTop = conversation.value.scrollHeight
}

watch(() => props.error?.retryAt, (retryAt) => {
  clearInterval(retryTimer)
  now.value = Date.now()
  if (retryAt && retryAt > now.value) retryTimer = setInterval(() => {
    now.value = Date.now()
    if (now.value >= retryAt) clearInterval(retryTimer)
  }, 1000)
}, { immediate: true })

watch([() => props.open, mobile], async ([open], [wasOpen]) => {
  await nextTick()
  if (open && mobile.value) lockBackground()
  else unlockBackground()
  if (open) {
    if (!panel.value?.contains(document.activeElement)) composer.value?.focus({ preventScroll: true })
    void scrollLatest()
  } else if (wasOpen) launcher.value?.focus({ preventScroll: true })
})
watch(() => [props.messages.length, props.loading, props.error], scrollLatest)

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.visualViewport?.addEventListener('scroll', updateViewport)
  if (props.open) { if (mobile.value) lockBackground(); composer.value?.focus({ preventScroll: true }); void scrollLatest() }
})
onUnmounted(() => {
  clearInterval(retryTimer)
  window.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('resize', updateViewport)
  window.visualViewport?.removeEventListener('scroll', updateViewport)
  unlockBackground()
})
</script>

<template>
  <div ref="root" data-support-chat class="support-chat text-ink">
    <Transition name="support-chat">
      <div v-if="invitation && !open" class="support-invitation flex items-start gap-1 rounded-xl border border-line bg-white p-2 shadow-lg">
        <button type="button" class="min-h-11 flex-1 rounded-lg px-2 text-left text-sm font-medium" @click="emit('open')">{{ invitation }}</button>
        <button type="button" class="support-icon" :aria-label="t('Tutup undangan bantuan')" @click="emit('dismiss-invitation')"><span aria-hidden="true" class="material-symbols-outlined">close</span></button>
      </div>
    </Transition>
    <button v-show="!open" ref="launcher" type="button" class="support-launcher flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg" :aria-label="t('Buka bantuan Dokumen Kita')" aria-controls="support-chat-panel" :aria-expanded="open" aria-haspopup="dialog" @click="emit('open')">
      <span class="material-symbols-outlined text-[28px]" aria-hidden="true">support_agent</span>
    </button>
    <Transition name="support-chat">
      <section v-if="open" id="support-chat-panel" ref="panel" role="dialog" :aria-modal="mobile || undefined" aria-labelledby="support-chat-title" class="support-panel flex flex-col overflow-hidden border border-line bg-white shadow-xl" :class="{ 'support-panel-mobile': mobile }" :style="viewportStyle" @keydown="keydown">
        <header class="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
          <span class="support-header-icon flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-primary" aria-hidden="true"><span class="material-symbols-outlined">support_agent</span></span>
          <div class="min-w-0 flex-1"><h2 id="support-chat-title" class="text-sm font-semibold">{{ t('Asisten Dokumen Kita') }}</h2><p class="mt-0.5 text-xs text-muted">{{ t('Bantuan penggunaan aplikasi') }}</p></div>
          <button type="button" class="support-icon" :aria-label="t('Tutup bantuan')" @click="emit('close')"><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
        </header>
        <div ref="conversation" class="support-conversation min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <div v-if="!messages.length" class="mb-5 rounded-xl bg-soft p-4">
            <p class="text-sm font-semibold">{{ t('Ada yang bisa kami bantu?') }}</p>
            <p class="mt-2 text-sm leading-6 text-muted">{{ t('Cari dokumen, periksa undangan dan progres tanda tangan, atau tanyakan cara menggunakan aplikasi.') }}</p>
          </div>
          <div role="log" :aria-label="t('Percakapan bantuan')" aria-live="polite" aria-relevant="additions" class="space-y-4">
            <div v-for="message in messages" :key="message.id" class="flex flex-col" :class="message.role === 'user' ? 'items-end' : 'items-start'">
              <span class="mb-1 text-[11px] font-medium text-muted">{{ message.role === 'user' ? t('Anda') : t('Asisten Dokumen Kita') }}</span>
              <p class="support-message max-w-[90%] rounded-xl px-3 py-2.5 text-sm leading-6" :class="message.role === 'user' ? 'bg-primary text-white' : 'bg-soft text-ink'">{{ message.text }}</p>
              <template v-if="message.role === 'assistant' && message.showReferences !== false">
                <RouterLink v-for="reference in (message.references ?? []).filter(item => chatReferencePath(item))" :key="`${reference.type}:${reference.resource_id}`" :to="chatReferencePath(reference)!" class="mt-2 min-h-11 max-w-[90%] rounded-lg border border-line px-3 py-2 text-sm text-primary underline wrap-anywhere" @click="emit('close')">{{ reference.label }}</RouterLink>
              </template>
            </div>
          </div>
          <p v-if="loading" role="status" class="mt-4 flex items-center gap-2 text-xs text-muted"><span class="size-3 animate-spin rounded-full border-2 border-line border-t-primary motion-reduce:animate-none" aria-hidden="true"></span>{{ t('Sedang menyiapkan jawaban…') }}</p>
          <div v-if="error" role="alert" class="mt-4 rounded-xl border border-error/25 bg-error/5 p-3 text-sm text-error">
            <p class="leading-6">{{ errorText }}</p>
            <button v-if="error.kind !== 'unauthenticated'" type="button" class="mt-1 min-h-11 rounded-lg px-2 font-semibold underline underline-offset-2 disabled:opacity-50" :disabled="loading || waiting > 0" @click="emit('retry')">{{ t('Coba lagi') }}</button>
          </div>
          <div v-if="suggestions.length && !messages.some(message => message.role === 'user')" class="mt-5 flex flex-col items-start gap-2" :aria-label="t('Saran pertanyaan')">
            <button v-for="question in suggestions" :key="question" type="button" class="min-h-11 max-w-full rounded-xl border border-line bg-white px-3 py-2 text-left text-xs leading-5 text-primary hover:bg-sage disabled:opacity-50 wrap-anywhere" :disabled="loading || waiting > 0 || error?.kind === 'unauthenticated'" @click="emit('send', question)">{{ question }}</button>
          </div>
        </div>
        <form class="support-composer shrink-0 border-t border-line px-4 pt-3 pb-3" @submit.prevent="send">
          <label for="support-chat-draft" class="sr-only">{{ t('Pertanyaan Anda') }}</label>
          <div class="flex items-end gap-2">
            <textarea id="support-chat-draft" ref="composer" :value="draft" rows="2" maxlength="2000" class="max-h-32 min-h-12 min-w-0 flex-1 resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm leading-6" :placeholder="t('Tulis pertanyaan…')" :aria-invalid="tooLong || undefined" aria-describedby="support-chat-hint" @input="emit('update:draft', ($event.target as HTMLTextAreaElement).value)" @keydown="composerKeydown"></textarea>
            <button type="submit" class="support-icon shrink-0 rounded-lg bg-primary text-white disabled:cursor-not-allowed disabled:opacity-50" :disabled="!canSend" :aria-label="t('Kirim pertanyaan')"><span class="material-symbols-outlined" aria-hidden="true">send</span></button>
          </div>
          <div id="support-chat-hint" class="mt-1.5 flex justify-between gap-2 text-[11px]" :class="tooLong ? 'text-error' : 'text-muted'"><span>{{ tooLong ? t('Maksimum 2000 karakter.') : t('Shift+Enter untuk baris baru') }}</span><span class="shrink-0">{{ draft.length }}/2000</span></div>
          <p class="mt-2 text-[10px] leading-4 text-muted">{{ t('Jangan kirim kata sandi atau isi dokumen privat.') }}</p>
        </form>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.support-chat { position: relative; z-index: 35; }
.support-launcher { position: fixed; right: max(1.25rem, env(safe-area-inset-right)); bottom: max(1.25rem, env(safe-area-inset-bottom)); }
.support-invitation { position: fixed; right: max(1.25rem, env(safe-area-inset-right)); bottom: calc(max(1.25rem, env(safe-area-inset-bottom)) + 4.25rem); width: min(19rem, calc(100vw - 2.5rem)); }
.support-panel { position: fixed; right: 1.25rem; bottom: 1.25rem; width: min(390px, calc(100vw - 2.5rem)); height: min(620px, calc(100dvh - 2.5rem)); border-radius: 1rem; }
.support-icon { display: inline-flex; min-width: 44px; min-height: 44px; align-items: center; justify-content: center; }
.support-message { white-space: pre-wrap; overflow-wrap: anywhere; }
.support-header-icon .material-symbols-outlined { line-height: 1; }
.support-chat button:focus-visible, .support-chat textarea:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 3px; }
.support-chat-enter-active, .support-chat-leave-active { transition: opacity 160ms ease, transform 160ms ease; }
.support-chat-enter-from, .support-chat-leave-to { opacity: 0; transform: translateY(8px); }
@media (max-width: 599px) {
  .support-panel { inset: 0; width: 100%; height: 100dvh; border-radius: 0; }
  .support-panel header { padding-top: max(.75rem, env(safe-area-inset-top)); padding-right: max(1rem, env(safe-area-inset-right)); padding-left: max(1rem, env(safe-area-inset-left)); }
  .support-composer { padding-bottom: max(.75rem, env(safe-area-inset-bottom)); padding-right: max(1rem, env(safe-area-inset-right)); padding-left: max(1rem, env(safe-area-inset-left)); }
  .support-conversation { padding-right: max(1rem, env(safe-area-inset-right)); padding-left: max(1rem, env(safe-area-inset-left)); }
  .support-chat textarea { font-size: 16px; }
}
@media (prefers-reduced-motion: reduce) {
  .support-chat-enter-active, .support-chat-leave-active { transition: none; }
}
</style>

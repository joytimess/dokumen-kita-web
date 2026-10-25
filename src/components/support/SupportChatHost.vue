<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useSupportChatStore } from '../../stores/support-chat'
import { authMode } from '../../services/http'
import { confirmation } from '../../services/feedback'
import { t } from '../../services/workspace-language'
import SupportChatWidget from './SupportChatWidget.vue'

const props = withDefaults(defineProps<{ blocked?: boolean }>(), { blocked: false })
const route = useRoute()
const auth = useAuthStore()
const chat = useSupportChatStore()
const modalOpen = ref(false)
const invitationVisible = ref(false)
const safeRoutes = ['/dashboard', '/documents', '/categories', '/history', '/signature-assets', '/profile']
const eligible = computed(() => authMode === 'api' && Boolean(auth.user) && !auth.sessionError
  && (safeRoutes.includes(route.path) || /^\/documents\/[0-9a-fA-F-]{36}$/.test(route.path)))
const visible = computed(() => eligible.value && !props.blocked && !modalOpen.value && !confirmation.value)
const invitation = computed(() => {
  if (!invitationVisible.value || chat.open) return ''
  if (route.path === '/profile') return t('Perlu bantuan mengatur profil?')
  if (route.path === '/signature-assets' || route.path === '/history') return t('Bingung cara menandatangani dokumen?')
  if (route.path.startsWith('/documents')) return t('Butuh bantuan mengelola dokumen?')
  return t('Perlu bantuan menggunakan Dokumen Kita?')
})
let timer: ReturnType<typeof setTimeout> | undefined
let observer: MutationObserver | undefined

watch([() => route.path, visible, () => chat.open, () => auth.user?.guid], () => {
  clearTimeout(timer)
  invitationVisible.value = false
  if (!visible.value) {
    chat.closeChat()
    return
  }
  if (chat.open || chat.invitationDismissed) return
  timer = setTimeout(() => {
    invitationVisible.value = true
    // A displayed invitation consumes this session's invitation, even after navigation.
    chat.dismissInvitation()
  }, 5000)
}, { immediate: true })

function scanModals() {
  modalOpen.value = Array.from(document.querySelectorAll('dialog[open], [aria-modal="true"]'))
    .some((node) => !node.closest('[data-support-chat]'))
}

function openChat() {
  invitationVisible.value = false
  chat.dismissInvitation()
  chat.openChat()
}

function dismissInvitation() {
  invitationVisible.value = false
  chat.dismissInvitation()
}

onMounted(() => {
  scanModals()
  observer = new MutationObserver(scanModals)
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'aria-modal'] })
})
onUnmounted(() => {
  clearTimeout(timer)
  observer?.disconnect()
  chat.closeChat()
})
</script>

<template>
  <SupportChatWidget
    v-if="visible"
    :open="chat.open"
    :messages="chat.messages"
    :draft="chat.draft"
    :loading="chat.loading"
    :error="chat.error"
    :suggestions="chat.suggestions"
    :invitation="invitation"
    @open="openChat"
    @close="chat.closeChat"
    @update:draft="chat.draft = $event"
    @send="chat.send"
    @retry="chat.retry"
    @dismiss-invitation="dismissInvitation"
  />
</template>

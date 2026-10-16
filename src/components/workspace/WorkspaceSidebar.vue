<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BrandLogo from '../brand/BrandLogo.vue'
import { language, setWorkspaceLanguage, t } from '../../services/workspace-language'

const props = defineProps<{ collapsed: boolean; mobileOpen: boolean }>()
const emit = defineEmits<{ close: [] }>()
const route = useRoute()
const documentsOpen = ref(true)
const signsOpen = ref(true)
const flyout = ref('')
const languageOpen = ref(false)
const compact = computed(() => props.collapsed && !props.mobileOpen)
const onDocuments = computed(() => route.path.startsWith('/documents'))
const onSigns = computed(() => route.path === '/signature-assets')

watch(() => route.path, () => {
  if (onDocuments.value) documentsOpen.value = true
  if (onSigns.value) signsOpen.value = true
  flyout.value = ''
  languageOpen.value = false
})

function toggleGroup(group: 'documents' | 'signs') {
  if (compact.value) {
    flyout.value = flyout.value === group ? '' : group
    languageOpen.value = false
  } else if (group === 'documents') documentsOpen.value = !documentsOpen.value
  else signsOpen.value = !signsOpen.value
}

function chooseLanguage(value: 'id' | 'en') {
  setWorkspaceLanguage(value)
  languageOpen.value = false
}
</script>

<template>
  <aside
    id="workspace-sidebar"
    class="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-white transition-[width,transform] duration-200 motion-reduce:transition-none"
    :class="[
      collapsed ? 'lg:w-[72px]' : 'lg:w-72',
      mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
    ]"
    :aria-label="t('Navigasi workspace')"
  >
    <div class="flex h-16 shrink-0 items-center justify-between px-5" :class="compact && 'justify-center px-2'">
      <BrandLogo to="/dashboard" :compact="compact" />
      <button
        v-if="mobileOpen"
        type="button"
        class="grid size-11 place-items-center rounded-lg text-muted hover:bg-soft lg:hidden"
        :aria-label="t('Tutup menu')"
        @click="emit('close')"
      ><span class="material-symbols-outlined" aria-hidden="true">close</span></button>
    </div>

    <nav class="min-h-0 flex-1 overflow-y-auto px-3 pb-4" :aria-label="t('Navigasi workspace')">
      <RouterLink
        to="/dashboard"
        class="mb-6 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold"
        :class="route.path === '/dashboard' ? 'bg-sage text-primary' : 'text-muted hover:bg-soft'"
        :aria-current="route.path === '/dashboard' ? 'page' : undefined"
        :title="compact ? t('Dashboard') : undefined"
        @click="emit('close')"
      >
        <span class="material-symbols-outlined text-[21px]" aria-hidden="true">space_dashboard</span>
        <span v-if="!compact">{{ t('Dashboard') }}</span>
      </RouterLink>

      <section class="relative mb-3">
        <button
          type="button"
          class="flex min-h-11 w-full items-center gap-3 rounded-xl bg-primary px-3 text-left text-sm font-semibold text-white"
          :class="compact && 'justify-center px-0'"
          :aria-label="t('Buka navigasi Dokumen')"
          :aria-expanded="compact ? flyout === 'documents' : documentsOpen"
          aria-controls="documents-submenu"
          :title="compact ? t('Dokumen') : undefined"
          @click="toggleGroup('documents')"
        >
          <span class="material-symbols-outlined text-[21px]" aria-hidden="true">description</span>
          <span v-if="!compact" class="flex-1">{{ t('Dokumen') }}</span>
          <span v-if="!compact" class="material-symbols-outlined text-base" aria-hidden="true">{{ documentsOpen ? 'expand_less' : 'expand_more' }}</span>
        </button>
        <div
          v-if="(!compact && documentsOpen) || (compact && flyout === 'documents')"
          id="documents-submenu"
          class="mt-2 grid gap-1 rounded-xl border border-line bg-[#fbfcfb] p-2"
          :class="compact && 'absolute top-0 left-full z-60 ml-3 mt-0 w-56 shadow-xl'"
        >
          <p class="rounded-lg px-3 py-2.5 text-sm text-muted" :title="t('Fitur ini belum tersedia.')">
            {{ t('Kategori Dokumen') }}<span class="mt-1 block text-xs text-muted">{{ t('Fitur ini belum tersedia.') }}</span>
          </p>
          <RouterLink
            to="/documents"
            class="rounded-lg px-3 py-2.5 text-sm"
            :class="onDocuments ? 'bg-sage font-semibold text-primary' : 'text-muted hover:bg-sage/60'"
            :aria-current="onDocuments ? 'page' : undefined"
            @click="emit('close')"
          >{{ t('Dokumen Saya') }}</RouterLink>
        </div>
      </section>

      <section class="relative">
        <button
          type="button"
          class="flex min-h-11 w-full items-center gap-3 rounded-xl bg-primary px-3 text-left text-sm font-semibold text-white"
          :class="compact && 'justify-center px-0'"
          :aria-label="t('Buka navigasi Tanda Tangan')"
          :aria-expanded="compact ? flyout === 'signs' : signsOpen"
          aria-controls="signs-submenu"
          :title="compact ? t('Tanda Tangan') : undefined"
          @click="toggleGroup('signs')"
        >
          <span class="material-symbols-outlined text-[21px]" aria-hidden="true">draw</span>
          <span v-if="!compact" class="flex-1">{{ t('Tanda Tangan') }}</span>
          <span v-if="!compact" class="material-symbols-outlined text-base" aria-hidden="true">{{ signsOpen ? 'expand_less' : 'expand_more' }}</span>
        </button>
        <div
          v-if="(!compact && signsOpen) || (compact && flyout === 'signs')"
          id="signs-submenu"
          class="mt-2 grid gap-1 rounded-xl border border-line bg-[#fbfcfb] p-2"
          :class="compact && 'absolute top-0 left-full z-60 ml-3 mt-0 w-56 shadow-xl'"
        >
          <RouterLink
            to="/signature-assets"
            class="rounded-lg px-3 py-2.5 text-sm"
            :class="onSigns ? 'bg-sage font-semibold text-primary' : 'text-muted hover:bg-sage/60'"
            :aria-current="onSigns ? 'page' : undefined"
            @click="emit('close')"
          >{{ t('Tanda Tangan Saya') }}</RouterLink>
          <p class="rounded-lg px-3 py-2.5 text-sm text-muted" :title="t('Fitur ini belum tersedia.')">
            {{ t('Riwayat Tanda Tangan') }}<span class="mt-1 block text-xs text-muted">{{ t('Fitur ini belum tersedia.') }}</span>
          </p>
        </div>
      </section>
    </nav>

    <div class="relative shrink-0 border-t border-line p-3">
      <button
        v-if="compact"
        type="button"
        class="grid size-11 w-full place-items-center rounded-xl text-muted hover:bg-soft"
        :aria-label="t('Bahasa')"
        :aria-expanded="languageOpen"
        aria-controls="language-picker"
        :title="t('Bahasa')"
        @click="languageOpen = !languageOpen; flyout = ''"
      ><span class="material-symbols-outlined" aria-hidden="true">language</span></button>
      <template v-else>
        <p class="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{{ t('Bahasa') }}</p>
        <div class="grid grid-cols-2 gap-1 rounded-xl bg-soft p-1" :aria-label="t('Bahasa')">
          <button type="button" class="min-h-10 rounded-lg text-xs font-semibold" :class="language === 'id' ? 'bg-white text-primary shadow-sm' : 'text-muted'" :aria-pressed="language === 'id'" @click="chooseLanguage('id')">Indonesia</button>
          <button type="button" class="min-h-10 rounded-lg text-xs font-semibold" :class="language === 'en' ? 'bg-white text-primary shadow-sm' : 'text-muted'" :aria-pressed="language === 'en'" @click="chooseLanguage('en')">English</button>
        </div>
      </template>
      <div
        v-if="languageOpen"
        id="language-picker"
        class="absolute bottom-full left-3 z-60 mb-3 grid w-52 gap-1 rounded-xl border border-line bg-white p-2 shadow-xl"
      >
        <button type="button" class="min-h-11 rounded-lg px-3 text-left text-sm hover:bg-soft" :aria-pressed="language === 'id'" @click="chooseLanguage('id')">Indonesia</button>
        <button type="button" class="min-h-11 rounded-lg px-3 text-left text-sm hover:bg-soft" :aria-pressed="language === 'en'" @click="chooseLanguage('en')">English</button>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { documentsApi } from '../../services/documents.service'
import { categoriesApi } from '../../services/categories.service'
import { useAuthStore } from '../../stores/auth'
import { workspaceError } from '../../services/workspace.errors'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import { confirmAction, notify } from '../../services/feedback'
import BaseButton from '../ui/BaseButton.vue'
import FeedbackMessage from '../ui/FeedbackMessage.vue'
import FormField from '../ui/FormField.vue'
import SelectControl from '../ui/SelectControl.vue'
import { t } from '../../services/workspace-language'

const router = useRouter()
const auth = useAuthStore()
const dialog = ref<HTMLDialogElement>()
const title = ref('')
const categoryGuid = ref('')
const categories = ref<{ guid: string; name: string }[]>([])
const categoryOptions = computed(() => [
  { value: '', label: t('Tanpa kategori') },
  ...categories.value.map(({ guid, name }) => ({ value: guid, label: name })),
])
const categoryError = ref('')
const attempted = ref(false)
const { busy, error, fields, run } = useWorkspaceRequest()
function open() {
  dialog.value?.showModal()
}
defineExpose({ open })

onMounted(async () => {
  try {
    categories.value = await categoriesApi.list()
  } catch (cause) {
    categoryError.value = workspaceError(cause).message
    if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
  }
})

async function createDraft() {
  if (!title.value.trim() || attempted.value || busy.value) return
  const draftTitle = title.value.trim()
  if (!(await confirmAction(t('Buat draft “:title”?', { title: draftTitle }), {
    title: t('Buat Dokumen'),
    action: t('Buat draft'),
  }))) return

  const document = await run(async () => {
    attempted.value = true
    try {
      return await documentsApi.create(draftTitle)
    } catch (cause) {
      if (!workspaceError(cause).ambiguous) attempted.value = false
      throw cause
    }
  })
  if (document) {
    let categoryNotSaved = false
    if (categoryGuid.value) {
      try {
        await documentsApi.assignCategory(document.guid, categoryGuid.value)
      } catch (cause) {
        categoryNotSaved = true
        if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
      }
    }
    notify[categoryNotSaved ? 'error' : 'success'](t(categoryNotSaved
      ? 'Draft dibuat, tetapi kategorinya belum tersimpan. Anda dapat memilih kategori dari daftar dokumen.'
      : 'Draft berhasil dibuat.'))
    await router.push(`/documents/${document.guid}/edit`)
  }
}
</script>

<template>
  <BaseButton class="shrink-0" @click="open"><slot>+ {{ t('Buat dokumen') }}</slot></BaseButton>
  <dialog
    ref="dialog"
    aria-labelledby="draft-title"
    aria-describedby="draft-description"
    class="draft-dialog fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl"
    @cancel="busy && $event.preventDefault()"
  >
    <form @submit.prevent="createDraft">
      <div class="border-b border-line px-6 pt-6 pb-5 sm:px-8 sm:pt-8">
        <p class="text-xs font-semibold tracking-widest text-primary">{{ t('Draft baru') }}</p>
        <h2 id="draft-title" class="mt-2 text-2xl font-semibold">{{ t('Buat dokumen baru') }}</h2>
        <p id="draft-description" class="mt-2 text-sm leading-6 text-muted">
          {{ t('Mulai dengan judul. Isi dan penerima disiapkan setelah draft dibuat.') }}
        </p>
      </div>
      <div class="px-6 pt-6 pb-2 sm:px-8">
        <FeedbackMessage :message="t(error)" error />
        <FormField
          id="document-title"
          v-model="title"
          :label="t('Judul dokumen')"
          :maxlength="255"
          :error="fields.title"
          :disabled="busy || attempted"
        />
        <div class="mb-[18px] grid gap-[7px] text-xs font-semibold">
          {{ t('Kategori (opsional)') }}
          <SelectControl v-model="categoryGuid" floating :ariaLabel="t('Kategori (opsional)')" class="min-h-11 w-full text-sm font-normal" :options="categoryOptions" :disabled="busy || attempted || !!categoryError" />
        </div>
        <FeedbackMessage v-if="categoryError" :message="t(categoryError)" error />
        <p v-if="attempted && error" class="pb-4 text-sm text-muted">
          {{ t('Hasil permintaan belum pasti. Periksa daftar dokumen sebelum memuat ulang halaman untuk mencoba lagi.') }}
        </p>
      </div>
      <div class="flex flex-wrap justify-end gap-3 border-t border-line bg-soft px-6 py-4 sm:px-8">
        <button
          type="button"
          class="min-h-12 rounded-lg border border-line bg-white px-5 text-sm font-semibold text-ink transition-colors duration-150 ease-out hover:bg-sage disabled:opacity-50 motion-reduce:transition-none"
          :disabled="busy"
          @click="dialog?.close()"
        >{{ t('Batal') }}</button>
        <button
          type="submit"
          class="min-h-12 rounded-lg border border-primary bg-primary px-6 py-3 text-sm font-semibold text-white enabled:hover:bg-[#174c39] disabled:cursor-not-allowed! disabled:opacity-65"
          :disabled="!title.trim() || attempted || busy"
        >{{ t('Buat draft') }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.draft-dialog {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
  transition:
    opacity 180ms ease-in,
    transform 180ms ease-in,
    display 180ms allow-discrete,
    overlay 180ms allow-discrete;
}
.draft-dialog[open] {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition-timing-function: ease-out;
}
@starting-style {
  .draft-dialog[open] { opacity: 0; transform: translateY(10px) scale(0.985); }
}
.draft-dialog::backdrop {
  background-color: rgb(8 29 21 / 0%);
  transition: background-color 180ms ease-in, display 180ms allow-discrete, overlay 180ms allow-discrete;
}
.draft-dialog[open]::backdrop { background-color: rgb(8 29 21 / 40%); transition-timing-function: ease-out; }
@starting-style {
  .draft-dialog[open]::backdrop { background-color: rgb(8 29 21 / 0%); }
}
@media (prefers-reduced-motion: reduce) {
  .draft-dialog, .draft-dialog::backdrop { transition: none; }
  .draft-dialog { transform: none; }
}
</style>

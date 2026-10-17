<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import axios from 'axios'
import { useRouter } from 'vue-router'
import { categoriesApi } from '../../services/categories.service'
import { workspaceError } from '../../services/workspace.errors'
import { confirmAction, notify } from '../../services/feedback'
import { useAuthStore } from '../../stores/auth'
import { t } from '../../services/workspace-language'
import type { CategoryColor, DocumentCategory } from '../../types/documents'
import { categoryColorClass, categoryColors } from '../../utils/category'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'

const router = useRouter()
const auth = useAuthStore()
const categories = ref<DocumentCategory[]>([])
const loaded = ref(false)
const loading = ref(false)
const saving = ref(false)
const loadError = ref('')
const saveError = ref('')
const fields = ref<Record<string, string>>({})
const openActions = ref('')
const dialog = ref<HTMLDialogElement>()
const conflictDialog = ref<HTMLDialogElement>()
const editingGuid = ref('')
const name = ref('')
const color = ref<CategoryColor>('gray')
const description = ref('')
const conflict = ref<{ guid: string; count: number }>()

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    categories.value = await categoriesApi.list()
    loaded.value = true
  } catch (cause) {
    loadError.value = workspaceError(cause).message
    if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
  } finally {
    loading.value = false
  }
}

function openCreate() {
  openActions.value = ''
  editingGuid.value = ''
  name.value = ''
  color.value = 'gray'
  description.value = ''
  saveError.value = ''
  fields.value = {}
  dialog.value?.showModal()
}

function openEdit(category: DocumentCategory) {
  openActions.value = ''
  editingGuid.value = category.guid
  name.value = category.name
  color.value = category.color_token
  description.value = category.description ?? ''
  saveError.value = ''
  fields.value = {}
  dialog.value?.showModal()
}

async function save() {
  if (saving.value || !name.value.trim()) return
  saving.value = true
  saveError.value = ''
  fields.value = {}
  try {
    const payload = { name: name.value.trim(), color_token: color.value, description: description.value.trim() || null }
    const saved = editingGuid.value
      ? await categoriesApi.update(editingGuid.value, payload)
      : await categoriesApi.create(payload)
    categories.value = editingGuid.value
      ? categories.value.map((item) => item.guid === saved.guid ? saved : item).sort((a, b) => a.name.localeCompare(b.name))
      : [...categories.value, saved].sort((a, b) => a.name.localeCompare(b.name))
    dialog.value?.close()
    notify.success(t(editingGuid.value ? 'Kategori berhasil diperbarui.' : 'Kategori berhasil dibuat.'))
  } catch (cause) {
    const error = workspaceError(cause)
    saveError.value = error.message
    fields.value = error.fields
    if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
  } finally {
    saving.value = false
  }
}

function showConflict(guid: string, count: number) {
  conflict.value = { guid, count }
  void nextTick(() => conflictDialog.value?.showModal())
}

async function remove(category: DocumentCategory) {
  openActions.value = ''
  if (category.documents_count) {
    showConflict(category.guid, category.documents_count)
    return
  }
  if (!(await confirmAction(t('Hapus kategori “:name”?', { name: category.name }), {
    title: t('Hapus kategori'), action: t('Hapus'), danger: true,
  }))) return
  try {
    await categoriesApi.delete(category.guid)
    categories.value = categories.value.filter((item) => item.guid !== category.guid)
    notify.success(t('Kategori berhasil dihapus.'))
  } catch (cause) {
    if (axios.isAxiosError(cause) && cause.response?.status === 409 && cause.response.data?.error?.code === 'CATEGORY_IN_USE') {
      const count = Number(cause.response.data?.meta?.usage_count ?? category.documents_count ?? 0)
      showConflict(category.guid, count)
      return
    }
    if (axios.isAxiosError(cause) && cause.response?.status === 401) auth.user = null
    notify.error(t(workspaceError(cause).message))
  }
}

function viewDocuments(guid: string) {
  openActions.value = ''
  conflictDialog.value?.close()
  conflict.value = undefined
  void router.push({ path: '/documents', query: { category_guid: guid } })
}

function toggleActions(guid: string) {
  openActions.value = openActions.value === guid ? '' : guid
}

onMounted(load)
</script>

<template>
  <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="mb-2 text-xs font-semibold tracking-[0.16em] text-primary">{{ t('Label dokumen') }}</p>
      <h1 class="text-3xl font-semibold">{{ t('Kategori Dokumen') }}</h1>
      <p class="mt-3 max-w-2xl text-sm text-muted">{{ t('Buat label pribadi untuk mengelompokkan dokumen Anda.') }}</p>
    </div>
    <button type="button" class="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-[#174c39]" @click="openCreate">+ {{ t('Buat kategori') }}</button>
  </div>

  <FeedbackMessage :message="t(loadError)" error />
  <button v-if="loadError" type="button" class="mb-4 min-h-11 text-sm font-semibold text-primary underline" @click="load">{{ t('Coba lagi') }}</button>
  <p v-if="loading && !loaded" role="status" class="py-10 text-center text-sm text-muted">{{ t('Memuat kategori…') }}</p>
  <section v-else-if="loaded && !categories.length" class="rounded-2xl border border-dashed border-line bg-white px-6 py-12 text-center">
    <span class="material-symbols-outlined text-4xl text-primary" aria-hidden="true">sell</span>
    <h2 class="mt-3 text-xl font-semibold">{{ t('Belum ada kategori.') }}</h2>
    <p class="mt-2 text-sm text-muted">{{ t('Buat kategori pertama Anda. Dokumen tetap dapat disimpan tanpa kategori.') }}</p>
    <button type="button" class="mt-5 min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white" @click="openCreate">{{ t('Buat kategori') }}</button>
  </section>
  <section v-else class="grid gap-3">
    <article v-for="category in categories" :key="category.guid" class="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-line bg-white p-4 sm:gap-5 sm:p-5">
      <span class="grid size-16 shrink-0 place-items-center rounded-2xl sm:size-20" :class="categoryColorClass(category.color_token)">
        <span class="material-symbols-outlined text-4xl sm:text-5xl" aria-hidden="true">folder</span>
      </span>
      <div class="min-w-0">
        <h2 class="truncate text-lg font-semibold">{{ category.name }}</h2>
        <p class="mt-1 whitespace-pre-wrap break-words text-sm text-muted">{{ category.description || t('Tidak ada deskripsi.') }}</p>
        <p class="mt-1 text-sm text-muted">{{ t(':count dokumen', { count: category.documents_count ?? 0 }) }}</p>
      </div>
      <div class="flex h-full min-h-20 shrink-0 flex-col items-center justify-between self-stretch">
        <div class="relative">
          <button type="button" :aria-label="t('Buka tindakan kategori :name', { name: category.name })" :aria-expanded="openActions === category.guid" :aria-controls="`category-actions-${category.guid}`" class="grid size-10 place-items-center rounded-lg text-muted hover:bg-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" @click="toggleActions(category.guid)">
            <span class="material-symbols-outlined" aria-hidden="true">more_vert</span>
          </button>
          <Transition name="workspace-dropdown">
            <div v-show="openActions === category.guid" :id="`category-actions-${category.guid}`" class="absolute right-0 top-full z-20 mt-1 min-w-36 rounded-xl border border-line bg-white p-1 shadow-xl">
              <button type="button" class="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-soft" @click="openEdit(category)">{{ t('Edit') }}</button>
              <button type="button" class="block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm text-error hover:bg-red-50" @click="remove(category)">{{ t('Hapus') }}</button>
            </div>
          </Transition>
        </div>
        <button type="button" :aria-label="t('Lihat dokumen kategori :name', { name: category.name })" class="grid size-10 place-items-center rounded-full bg-sage text-primary hover:bg-primary hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" @click="viewDocuments(category.guid)">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </button>
      </div>
    </article>
  </section>

  <dialog v-if="conflict" ref="conflictDialog" aria-labelledby="category-conflict-title" aria-describedby="category-conflict-description" class="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-white p-6 text-ink shadow-2xl" @close="conflict = undefined">
    <section role="alert">
      <h2 id="category-conflict-title" class="text-xl font-semibold">{{ t('Kategori masih digunakan') }}</h2>
      <p id="category-conflict-description" class="mt-3 text-sm leading-6 text-muted">{{ t('Kategori ini tidak dapat dihapus karena masih ada dokumen memiliki kategori ini.') }} {{ t(':count dokumen', { count: conflict.count }) }}</p>
      <div class="mt-5 flex justify-end gap-3">
        <button type="button" class="min-h-11 rounded-lg border border-line px-4 text-sm font-semibold" @click="conflictDialog?.close()">{{ t('Tutup') }}</button>
        <button type="button" class="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-white" @click="viewDocuments(conflict.guid)">{{ t('Lihat Dokumen') }}</button>
      </div>
    </section>
  </dialog>

  <dialog ref="dialog" aria-labelledby="category-form-title" class="category-dialog fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-0 text-ink shadow-2xl" @cancel="saving && $event.preventDefault()">
    <form @submit.prevent="save">
      <div class="border-b border-line px-6 py-5 sm:px-8">
        <h2 id="category-form-title" class="text-2xl font-semibold">{{ t(editingGuid ? 'Ubah kategori' : 'Buat kategori') }}</h2>
        <p class="mt-2 text-sm text-muted">{{ t('Warna kategori hanya menjadi label visual.') }}</p>
      </div>
      <div class="px-6 py-5 sm:px-8">
        <FeedbackMessage :message="t(saveError)" error />
        <label for="category-name" class="mb-2 block text-xs font-semibold">{{ t('Nama kategori') }}</label>
        <input id="category-name" v-model="name" autofocus maxlength="255" required class="mb-1 min-h-11 w-full rounded-lg border border-line px-3 text-sm" :aria-invalid="!!fields.name" aria-describedby="category-name-error" :disabled="saving" />
        <p v-if="fields.name" id="category-name-error" class="mb-4 text-xs text-error">{{ t(fields.name) }}</p>
        <p v-else class="mb-4 text-xs text-muted">{{ t('Nama kategori unik dalam akun Anda.') }}</p>
        <fieldset class="mb-5">
          <legend class="mb-2 text-xs font-semibold">{{ t('Warna') }}</legend>
          <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label v-for="item in categoryColors" :key="item.value" class="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm" :class="[item.classes, color === item.value ? 'ring-2 ring-primary ring-offset-1' : '']">
              <input v-model="color" type="radio" name="category-color" :value="item.value" :disabled="saving" />
              {{ t(item.label) }}
            </label>
          </div>
        </fieldset>
        <label for="category-description" class="mb-2 block text-xs font-semibold">{{ t('Deskripsi (opsional)') }}</label>
        <textarea id="category-description" v-model="description" maxlength="500" rows="3" class="w-full resize-y rounded-lg border border-line px-3 py-2 text-sm" :disabled="saving" />
        <p class="mt-1 text-right text-xs text-muted">{{ description.length }}/500</p>
      </div>
      <div class="flex justify-end gap-3 border-t border-line bg-soft px-6 py-4 sm:px-8">
        <button type="button" class="min-h-11 rounded-lg border border-line bg-white px-4 text-sm font-semibold" :disabled="saving" @click="dialog?.close()">{{ t('Batal') }}</button>
        <button type="submit" class="min-h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60" :disabled="saving || !name.trim()">{{ saving ? t('Menyimpan…') : t('Simpan') }}</button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.category-dialog {
  opacity: 0;
  transform: translateY(10px) scale(0.985);
  transition:
    opacity 180ms ease-in,
    transform 180ms ease-in,
    display 180ms allow-discrete,
    overlay 180ms allow-discrete;
}
.category-dialog[open] {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition-timing-function: ease-out;
}
@starting-style {
  .category-dialog[open] { opacity: 0; transform: translateY(10px) scale(0.985); }
}
.category-dialog::backdrop {
  background-color: rgb(8 29 21 / 0%);
  transition: background-color 180ms ease-in, display 180ms allow-discrete, overlay 180ms allow-discrete;
}
.category-dialog[open]::backdrop { background-color: rgb(8 29 21 / 40%); transition-timing-function: ease-out; }
@starting-style {
  .category-dialog[open]::backdrop { background-color: rgb(8 29 21 / 0%); }
}
dialog::backdrop { background: rgb(8 29 21 / 40%); }
@media (prefers-reduced-motion: reduce) {
  .category-dialog, .category-dialog::backdrop { transition: none; }
  .category-dialog { transform: none; }
}
</style>

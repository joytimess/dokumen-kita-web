<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, inject, type Ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { documentsApi } from '../../services/documents.service'
import { workspaceError } from '../../services/workspace.errors'
import { createAutosave } from '../../composables/useAutosave'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import { useAuthStore } from '../../stores/auth'
import type { DocumentRecord, DraftPayload, EditorData, Assignment } from '../../types/documents'
import { areasReviewed, snapshotReady, dateLabel } from '../../utils/documents'
import NativeEditor from '../../components/documents/NativeEditor.vue'
import SignersForm from '../../components/documents/SignersForm.vue'
import PlaceholderPanel from '../../components/documents/PlaceholderPanel.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
import StatusBadge from '../../components/documents/StatusBadge.vue'
const route = useRoute(),
  router = useRouter(),
  auth = useAuthStore()
const identity = auth.user!.guid
const beforeLogout = inject<Ref<(() => Promise<boolean>) | null>>('workspaceBeforeLogout')
const guid = String(route.params.documentGuid)
const document = ref<DocumentRecord>(),
  title = ref(''),
  content = shallowRef<EditorData>({ blocks: [] })
const editor = ref<InstanceType<typeof NativeEditor>>()
const saver =
  shallowRef<ReturnType<typeof createAutosave<{ title: string; editor_data: EditorData }>>>()
const stage = ref(0),
  pendingEditor = ref(false),
  editorError = ref(''),
  extraDirty = ref(false),
  reviewed = ref(false),
  locked = ref(false),
  message = ref(''),
  importUncertain = ref(false)
const { busy, error, fields, run } = useWorkspaceRequest()
let savedContent = '',
  active = true
let saveBlockedUntil = 0
const dirty = computed(
  () =>
    pendingEditor.value || !!editorError.value || !!saver.value?.dirty.value || extraDirty.value,
)
const editable = computed(
  () =>
    !!document.value &&
    document.value.owner_guid === identity &&
    document.value.current_version.status === 'draft' &&
    !locked.value,
)
const preview = computed(
  () =>
    !!document.value &&
    snapshotReady(document.value) &&
    !saver.value?.dirty.value &&
    !pendingEditor.value,
)
const canPublish = computed(
  () =>
    editable.value &&
    preview.value &&
    reviewed.value &&
    !dirty.value &&
    areasReviewed(
      document.value!.current_version.assignments ?? [],
      document.value!.current_version.preview_page_count!,
    ),
)
async function load() {
  const result = await run(() => documentsApi.detail(guid))
  if (!result) return
  document.value = result
  title.value = result.title
  content.value = result.current_version.editor_data ?? { blocks: [] }
  savedContent = JSON.stringify(content.value)
  if (result.owner_guid !== identity || result.current_version.status !== 'draft') return
  const versionGuid = result.current_version.guid
  saver.value = createAutosave(
    { title: title.value, editor_data: content.value },
    async (payload) => {
      if (!active || auth.user?.guid !== identity || locked.value)
        throw new Error('SESSION_CHANGED')
      if (Date.now() < saveBlockedUntil) throw new Error('RATE_LIMITED')
      const changes: DraftPayload = { title: payload.title }
      const contentChanged = JSON.stringify(payload.editor_data) !== savedContent
      if (contentChanged) changes.editor_data = payload.editor_data
      const version = await documentsApi.save(versionGuid, changes)
      if (!active || auth.user?.guid !== identity) throw new Error('SESSION_CHANGED')
      document.value!.current_version = {
        ...document.value!.current_version,
        ...version,
        assignments: (document.value!.current_version.assignments ?? []).map((a) => ({
          ...a,
          placeholders: a.placeholders?.map((p) => ({
            ...p,
            needs_review: contentChanged || p.needs_review,
          })),
        })),
      }
      document.value!.title = payload.title
      savedContent = JSON.stringify(version.editor_data ?? payload.editor_data)
      return { title: payload.title, editor_data: version.editor_data ?? payload.editor_data }
    },
    {
      onSaved(value, latest) {
        if (latest && JSON.stringify(content.value) !== JSON.stringify(value.editor_data)) {
          content.value = value.editor_data
          void editor.value?.render(value.editor_data)
        }
      },
      onError(cause) {
        if (cause instanceof Error && cause.message === 'RATE_LIMITED') {
          error.value = `Tunggu ${Math.max(0, Math.ceil((saveBlockedUntil - Date.now()) / 1000))} detik sebelum menyimpan lagi.`
          return
        }
        const feedback = workspaceError(cause)
        error.value = feedback.message
        fields.value = feedback.fields
        if (feedback.retryAt) {
          saveBlockedUntil = feedback.retryAt
          error.value += ` Coba lagi dalam ${Math.ceil((saveBlockedUntil - Date.now()) / 1000)} detik.`
        }
        if ([401, 403, 409].includes(feedback.status ?? 0)) {
          locked.value = true
          void editor.value?.lock()
          if (feedback.status === 401) auth.user = null
          else
            void documentsApi
              .detail(guid)
              .then((fresh) => {
                if (active) document.value = fresh
              })
              .catch(() => {})
          return true
        }
      },
    },
  )
}
function changed(data: EditorData) {
  pendingEditor.value = false
  editorError.value = ''
  content.value = data
  if (!editable.value) return
  if (JSON.stringify(data) !== savedContent) reviewed.value = false
  saver.value?.change({ title: title.value, editor_data: data })
}
function titleChanged() {
  if (editable.value) saver.value?.change({ title: title.value, editor_data: content.value })
}
async function flush() {
  if (!editable.value || !saver.value) return false
  const data = await editor.value?.capture()
  if (data) changed(data)
  if (editorError.value || pendingEditor.value || !title.value.trim()) {
    error.value = editorError.value || 'Judul wajib diisi sebelum menyimpan.'
    return false
  }
  return saver.value.flush()
}
async function refreshMetadata() {
  const result = await run(() => documentsApi.detail(guid))
  if (result) document.value = result
}
async function switchStage(next: number) {
  if (next === stage.value || !(await flush())) return
  if (
    extraDirty.value &&
    !window.confirm('Perubahan penerima/posisi belum tersimpan. Tinggalkan tahap ini?')
  )
    return
  extraDirty.value = false
  stage.value = next
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0]
  input.value = ''
  if (!file || importUncertain.value) return
  if (!/\.(pdf|docx)$/i.test(file.name) || file.size > 20480 * 1024) {
    error.value = 'Pilih PDF/DOCX maksimal 20.480 KB.'
    return
  }
  if (
    document.value?.current_version.has_source &&
    !window.confirm('Sumber lama akan diganti dan pratinjau tidak lagi siap. Lanjutkan?')
  )
    return
  if (!(await flush())) return
  const result = await run(async () => {
    try {
      return await documentsApi.import(guid, file)
    } catch (cause) {
      if (workspaceError(cause).ambiguous) importUncertain.value = true
      throw cause
    }
  })
  reviewed.value = false
  if (result) {
    await refreshMetadata()
    message.value =
      'Sumber tersimpan. Berkas belum dikonversi menjadi isi editor atau snapshot preview.'
  } else if (importUncertain.value) await refreshMetadata()
}
async function publish() {
  if (!canPublish.value || !(await flush())) return
  if (
    !canPublish.value ||
    !window.confirm(
      'Kirim versi ini? Isi, penerima, dan posisi akan dikunci untuk proses tanda tangan.',
    )
  )
    return
  const result = await run(() => documentsApi.publish(document.value!.current_version.guid))
  if (result) {
    saver.value?.dispose()
    extraDirty.value = false
    message.value =
      'Proses tanda tangan dimulai. Permintaan undangan diterima; penerimaan email belum dipastikan.'
    await router.replace(`/documents/${guid}`)
  } else {
    await refreshMetadata()
    locked.value = document.value?.current_version.status !== 'draft'
  }
}
function positionsSaved(assignments: Assignment[]) {
  if (document.value) document.value.current_version.assignments = assignments
}
function signersSaved() {
  extraDirty.value = false
  reviewed.value = false
  void refreshMetadata()
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault()
    event.returnValue = ''
  }
}
async function onFocus() {
  if (
    globalThis.document.visibilityState !== 'visible' ||
    !active ||
    !document.value ||
    busy.value ||
    saver.value?.saving.value
  )
    return
  try {
    const fresh = await documentsApi.detail(guid)
    if (!active) return
    if (
      fresh.current_version.status !== 'draft' ||
      fresh.current_version.guid !== document.value.current_version.guid ||
      JSON.stringify(fresh.current_version.editor_data) !== savedContent
    ) {
      locked.value = true
      saver.value?.stop()
      await editor.value?.lock()
      reviewed.value = false
      error.value =
        'Dokumen berubah di luar halaman ini. Perubahan lokal dipertahankan; muat ulang setelah meninjaunya.'
      document.value = fresh
    } else if (
      fresh.current_version.content_hash !== document.value.current_version.content_hash ||
      fresh.current_version.preview_status !== document.value.current_version.preview_status
    ) {
      reviewed.value = false
      if (!extraDirty.value) document.value = fresh
      else {
        locked.value = true
        saver.value?.stop()
        error.value =
          'Snapshot berubah di luar halaman ini. Perubahan posisi lokal dipertahankan; muat ulang setelah meninjaunya.'
      }
    }
  } catch {
    /* A failed focus check never overwrites local work. */
  }
}
watch(
  () => auth.user?.guid,
  (value) => {
    if (value !== identity) {
      saver.value?.dispose()
      content.value = { blocks: [] }
      document.value = undefined
      void editor.value?.lock()
    }
  },
)
async function leave() {
  if (!active || auth.user?.guid !== identity) return true
  if (!dirty.value) return true
  if ((await flush()) && !extraDirty.value) return true
  return window.confirm(
    'Perubahan belum tersimpan. Keluar dan kehilangan perubahan di halaman ini?',
  )
}
onBeforeRouteLeave(leave)
if (beforeLogout) beforeLogout.value = leave
onMounted(() => {
  void load()
  window.addEventListener('beforeunload', beforeUnload)
  window.addEventListener('focus', onFocus)
})
onUnmounted(() => {
  if (beforeLogout) beforeLogout.value = null
  active = false
  saver.value?.dispose()
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('focus', onFocus)
})
</script>
<template>
  <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
    <div>
      <RouterLink :to="`/documents/${guid}`" class="text-xs text-primary underline"
        >← Detail dokumen</RouterLink
      >
      <h1 class="mt-3 text-3xl font-semibold">Siapkan dokumen.</h1>
    </div>
    <div v-if="saver" class="flex flex-wrap items-center gap-4">
      <p class="text-xs text-muted" role="status" aria-live="polite">
        {{
          saver.error.value ||
          (saver.saving.value
            ? 'Menyimpan…'
            : dirty
              ? 'Belum tersimpan'
              : saver.savedAt.value
                ? `Tersimpan ${dateLabel(new Date(saver.savedAt.value).toISOString())}`
                : 'Tersimpan')
        }}
      </p>
      <BaseButton :loading="saver.saving.value" :disabled="!editable || busy" @click="flush">{{
        saver.error.value ? 'Coba simpan lagi' : 'Simpan'
      }}</BaseButton>
    </div>
  </div>
  <FeedbackMessage :message="error || editorError" error /><FeedbackMessage :message="message" />
  <p v-for="(text, key) in fields" :key="key" class="mb-2 text-sm text-error">{{ text }}</p>
  <p v-if="busy && !document" role="status">Memuat draft…</p>
  <button v-if="error && !document" class="min-h-11 text-primary underline" @click="load">
    Coba lagi
  </button>
  <template v-if="document"
    ><div v-if="!editable" class="rounded-xl border border-line bg-white p-6">
      <StatusBadge :status="document.current_version.status" />
      <p class="mt-4 text-sm">
        Dokumen tidak dapat diedit pada status atau hak akses saat ini. Perubahan lokal tidak
        dikirim lagi.
      </p>
      <button class="mt-3 min-h-11 text-primary underline" @click="router.go(0)">
        Muat ulang versi server
      </button>
    </div>
    <div :class="!editable ? 'pointer-events-none opacity-60' : ''">
      <nav class="mb-6 flex flex-wrap gap-2" aria-label="Tahap penyusunan">
        <button
          v-for="(label, index) in [
            'Isi / Impor',
            'Penerima',
            'Posisi Tanda Tangan',
            'Tinjau dan Kirim',
          ]"
          :key="label"
          class="min-h-11 rounded-full border border-line px-4 text-xs disabled:opacity-40"
          :class="stage === index ? 'bg-primary text-white' : 'bg-white text-muted'"
          :aria-current="stage === index ? 'step' : undefined"
          :disabled="busy || !editable"
          @click="switchStage(index)"
        >
          {{ index + 1 }}. {{ label }}
        </button>
      </nav>
      <section v-show="stage === 0" class="grid min-w-0 gap-5">
        <label class="grid gap-2 text-xs font-semibold"
          >Judul dokumen<input
            v-model="title"
            class="min-h-12 w-full rounded-lg border border-line bg-white px-4 text-lg"
            maxlength="255"
            :disabled="!editable || busy"
            @input="titleChanged" /></label
        ><NativeEditor
          v-if="saver"
          ref="editor"
          :data="content"
          @pending="pendingEditor = true"
          @change="changed"
          @invalid="editorError = $event"
        />
        <div class="rounded-xl border border-line bg-white p-5">
          <h2 class="font-semibold">Sumber PDF / DOCX</h2>
          <p class="my-3 text-sm text-muted">
            Berkas sumber disimpan privat. Impor belum dikonversi menjadi isi editable dan belum
            membuat snapshot.
          </p>
          <p v-if="document.current_version.has_source" class="mb-3 text-xs">
            Sumber tersimpan: {{ document.current_version.source_type }}
          </p>
          <label
            class="inline-flex min-h-11 cursor-pointer items-center rounded border border-line px-4 text-sm text-primary"
            >{{ document.current_version.has_source ? 'Ganti sumber' : 'Unggah sumber'
            }}<input
              type="file"
              accept=".pdf,.docx"
              class="sr-only"
              :disabled="busy || !editable || importUncertain"
              @change="upload"
          /></label>
          <p class="mt-3 text-xs text-muted">
            Maksimal 20.480 KB sesuai konfigurasi backend saat ini.
          </p>
          <p v-if="importUncertain" class="mt-3 text-xs text-error">
            Hasil upload belum pasti. Detail sudah diperiksa ulang; tinjau metadata dan muat ulang
            sebelum mengunggah lagi.
          </p>
        </div>
      </section>
      <SignersForm
        v-if="stage === 1"
        :version-guid="document.current_version.guid"
        :assignments="document.current_version.assignments ?? []"
        :flush="flush"
        @dirty="extraDirty = $event"
        @saved="signersSaved"
      />
      <template v-if="stage === 2"
        ><PlaceholderPanel
          v-if="preview && document.current_version.assignments?.length"
          :version-guid="document.current_version.guid"
          :hash="document.current_version.content_hash!"
          :pages="document.current_version.preview_page_count!"
          :assignments="document.current_version.assignments"
          :flush="flush"
          @dirty="extraDirty = $event"
          @reviewed="reviewed = $event"
          @saved="positionsSaved"
        />
        <div v-else class="rounded-xl border border-line bg-white p-6">
          <h2 class="font-semibold">Penempatan belum dapat dilanjutkan.</h2>
          <p class="mt-3 text-sm text-muted">
            Simpan penerima dan gunakan snapshot preview valid dari backend. Upload sumber tidak
            membuat preview; renderer belum tersedia.
          </p>
        </div></template
      >
      <section v-if="stage === 3" class="rounded-xl border border-line bg-white p-5 sm:p-8">
        <h2 class="text-2xl font-semibold wrap-anywhere">{{ title }}</h2>
        <p class="my-4 text-sm text-muted">
          Versi {{ document.current_version.version_number }} ·
          {{ document.current_version.preview_page_count ?? 'Belum ada' }} halaman preview
        </p>
        <div
          v-for="a in document.current_version.assignments"
          :key="a.guid"
          class="my-3 rounded border border-line p-3 text-sm wrap-anywhere"
        >
          {{ a.sequence_number }}. {{ a.recipient_email }} · {{ a.placeholders?.length ?? 0 }} area
        </div>
        <p v-if="!canPublish" class="my-5 text-sm text-muted">
          Kirim tersedia setelah isi tersimpan, snapshot siap, semua penerima memiliki area valid
          yang tersimpan, dan posisi telah ditinjau pada tahap sebelumnya.
        </p>
        <BaseButton :disabled="!canPublish || busy" :loading="busy" @click="publish"
          >Kirim untuk tanda tangan</BaseButton
        >
        <p class="mt-4 text-xs text-muted">
          Versi akan dikunci. Keberhasilan tidak membuktikan email sudah diterima.
        </p>
      </section>
    </div></template
  >
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, inject, type Ref } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import { documentsApi } from '../../services/documents.service'
import { editorPayload } from '../../utils/editor'
import { workspaceError } from '../../services/workspace.errors'
import { createAutosave } from '../../composables/useAutosave'
import { useWorkspaceRequest } from '../../composables/useWorkspaceRequest'
import { useAuthStore } from '../../stores/auth'
import { useDecorations } from '../../composables/useDecorations'
import { useSourceFile } from '../../composables/useSourceFile'
import type {
  DocumentRecord,
  DocumentVersion,
  DraftPayload,
  EditorData,
  Assignment,
} from '../../types/documents'
import {
  areasReviewed,
  snapshotReady,
  dateLabel,
  expectedConversion,
  remoteVersionConflict,
} from '../../utils/documents'
import NativeEditor from '../../components/documents/NativeEditor.vue'
import SignersForm from '../../components/documents/SignersForm.vue'
import PlaceholderPanel from '../../components/documents/PlaceholderPanel.vue'
import PdfViewer from '../../components/documents/PdfViewer.vue'
import BaseButton from '../../components/ui/BaseButton.vue'
import FeedbackMessage from '../../components/ui/FeedbackMessage.vue'
import DecorationSection from '../../components/documents/DecorationSection.vue'
import SourceSection from '../../components/documents/SourceSection.vue'
import ReadOnlyNotice from '../../components/documents/ReadOnlyNotice.vue'
import ProcessingOverlay from '../../components/documents/ProcessingOverlay.vue'

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
  pollCount = ref(0)
const serverVersion = shallowRef<DocumentVersion>()
const { busy, error, fields, run } = useWorkspaceRequest()
let savedContent = '',
  active = true
let pollTimer: ReturnType<typeof setTimeout> | undefined
let pollEpoch = 0
let saveBlockedUntil = 0

const editable = computed(
  () =>
    !!document.value &&
    document.value.owner_guid === identity &&
    document.value.current_version.status === 'draft' &&
    document.value.current_version.is_current !== false &&
    !locked.value,
)

const {
  decorations,
  decorationsDirty,
  decorationSaving,
  syncDecorations,
  chooseDecoration,
  removeDecoration,
  saveDecorations,
  dispose: disposeDecorations,
} = useDecorations({
  document,
  editable,
  reviewed,
  error,
  locked,
  isActive: () => active,
  scheduleSave: () => {
    void flush()
  },
  rebuildPreview,
})

const { sourceUrl, sourceBusy, importUncertain, upload, retryConversion, openSource, clearSource } =
  useSourceFile({
    guid,
    document,
    content,
    reviewed,
    message,
    error,
    busy,
    run,
    flush,
    applyVersion,
    refreshMetadata,
    stopPolling,
    startPolling,
    isActive: () => active,
  })

const dirty = computed(
  () =>
    pendingEditor.value ||
    !!editorError.value ||
    !!saver.value?.dirty.value ||
    extraDirty.value ||
    decorationsDirty.value,
)
const preview = computed(
  () =>
    !!document.value &&
    snapshotReady(document.value) &&
    document.value.current_version.preview_source === 'editor' &&
    !['queued', 'processing', 'failed'].includes(
      document.value.current_version.conversion_status ?? 'none',
    ) &&
    !saver.value?.dirty.value &&
    !decorationsDirty.value &&
    !editorError.value &&
    !pendingEditor.value,
)
const processing = computed(
  () =>
    !!document.value &&
    (['queued', 'processing'].includes(document.value.current_version.conversion_status ?? '') ||
      document.value.current_version.preview_status === 'queued'),
)
const canPublish = computed(
  () =>
    editable.value &&
    preview.value &&
    reviewed.value &&
    !dirty.value &&
    !saver.value?.saving.value &&
    areasReviewed(
      document.value!.current_version.assignments ?? [],
      document.value!.current_version.preview_page_count!,
    ),
)

function stopPolling() {
  pollEpoch++
  clearTimeout(pollTimer)
}

function startPolling() {
  pollCount.value = 0
  schedulePoll()
}

async function load() {
  const result = await run(async () => {
    const record = await documentsApi.detail(guid)
    return { ...record, current_version: await documentsApi.version(record.current_version.guid) }
  })
  if (!result) return
  document.value = result
  syncDecorations()
  serverVersion.value = undefined
  title.value = result.title
  content.value = result.current_version.editor_data ?? { blocks: [] }
  const normalizedContent = editorPayload(content.value)
  savedContent = JSON.stringify(normalizedContent)
  if (result.owner_guid !== identity || result.current_version.status !== 'draft') return
  const versionGuid = result.current_version.guid
  saver.value = createAutosave(
    { title: title.value, editor_data: normalizedContent },
    async (payload) => {
      if (!active || auth.user?.guid !== identity || locked.value)
        throw new Error('SESSION_CHANGED')
      if (Date.now() < saveBlockedUntil) throw new Error('RATE_LIMITED')
      const changes: DraftPayload = { title: payload.title }
      const contentChanged = JSON.stringify(payload.editor_data) !== savedContent
      if (contentChanged) {
        changes.editor_data = payload.editor_data
        changes.editor_revision = document.value!.current_version.editor_revision
      }
      const version = await documentsApi.save(versionGuid, changes)
      if (!active || auth.user?.guid !== identity) throw new Error('SESSION_CHANGED')
      if (document.value?.current_version.guid !== versionGuid) throw new Error('VERSION_CHANGED')
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
      const normalized = editorPayload(version.editor_data ?? payload.editor_data)
      savedContent = JSON.stringify(normalized)
      return { title: payload.title, editor_data: normalized }
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
          saver.value?.stop()
          void editor.value?.capture().then((data) => {
            if (data) content.value = data
          })
          void editor.value?.lock()
          if (feedback.status === 401) auth.user = null
          else
            void documentsApi
              .version(versionGuid)
              .then((fresh) => {
                if (active && document.value?.current_version.guid === versionGuid) {
                  serverVersion.value = fresh
                  document.value.current_version = fresh
                }
              })
              .catch(() => {})
          return true
        }
      },
    },
  )
  schedulePoll()
}

function applyVersion(version: DocumentVersion) {
  if (!active || !document.value || document.value.current_version.guid !== version.guid) return
  const old = document.value.current_version
  const revisionChanged = version.editor_revision !== old.editor_revision
  const conversionFinished = expectedConversion(old, version)
  const hadLocalChanges = dirty.value
  if (
    remoteVersionConflict(old, version, dirty.value, !!saver.value?.saving.value, extraDirty.value)
  ) {
    locked.value = true
    saver.value?.stop()
    serverVersion.value = version
    reviewed.value = false
    error.value =
      'Versi server berubah. Perubahan lokal dipertahankan; tinjau dan salin sebelum memuat ulang.'
    void editor.value?.capture().then((data) => {
      if (data) content.value = data
    })
    void editor.value?.lock()
    document.value.current_version = {
      ...version,
      assignments: version.assignments ?? old.assignments,
    }
    return
  }
  if (
    old.conversion_generation !== version.conversion_generation ||
    old.has_source !== version.has_source
  )
    clearSource()
  document.value.current_version = {
    ...version,
    assignments: version.assignments ?? old.assignments,
  }
  if (revisionChanged && !hadLocalChanges && !conversionFinished) syncDecorations()
  if (conversionFinished && revisionChanged && version.editor_data) {
    content.value = version.editor_data
    savedContent = JSON.stringify(editorPayload(version.editor_data))
    saver.value?.dispose()
    saver.value = undefined
    void editor.value?.render(version.editor_data)
    void load()
  }
}

function schedulePoll() {
  clearTimeout(pollTimer)
  if (!active || !document.value || globalThis.document.visibilityState !== 'visible') return
  const version = document.value.current_version
  if (
    !['queued', 'processing'].includes(version.conversion_status ?? '') &&
    version.preview_status !== 'queued'
  )
    return
  const epoch = pollEpoch
  pollTimer = setTimeout(
    async () => {
      const guid = version.guid
      if (saver.value?.saving.value) {
        schedulePoll()
        return
      }
      try {
        const fresh = await documentsApi.version(guid)
        if (!active || pollEpoch !== epoch || document.value?.current_version.guid !== guid) return
        pollCount.value++
        if (error.value === 'Status belum dapat diperiksa. Mencoba lagi otomatis.') error.value = ''
        applyVersion(fresh)
      } catch {
        if (active && pollEpoch === epoch)
          error.value = 'Status belum dapat diperiksa. Mencoba lagi otomatis.'
      }
      if (active && pollEpoch === epoch) schedulePoll()
    },
    pollCount.value < 30 ? 3000 : 10000,
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
  if (!(await saver.value.flush())) return false
  return saveDecorations()
}

async function rebuildPreview(versionGuid: string) {
  try {
    const version = await documentsApi.preview(versionGuid)
    applyVersion(version)
    startPolling()
  } catch (cause) {
    error.value = `Kop/footer tersimpan, tetapi preview belum dapat dibuat. ${workspaceError(cause).message}`
  }
}

async function refreshMetadata() {
  const versionGuid = document.value?.current_version.guid
  if (!versionGuid) return
  if (saver.value?.saving.value) await saver.value.flush()
  const result = await run(() => documentsApi.version(versionGuid))
  if (result) applyVersion(result)
  startPolling()
}

async function switchStage(next: number) {
  if (next === stage.value || !(await flush())) return
  if (
    extraDirty.value &&
    !window.confirm('Perubahan penerima/posisi belum tersimpan. Tinggalkan tahap ini?')
  )
    return
  extraDirty.value = false
  if (next === 2) await refreshMetadata()
  stage.value = next
}

async function makePreview() {
  if (!(await flush())) return
  stopPolling()
  const result = await run(() => documentsApi.preview(document.value!.current_version.guid))
  if (result) {
    applyVersion(result)
    reviewed.value = false
    startPolling()
  }
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
    saver.value?.saving.value ||
    decorationSaving.value
  )
    return
  try {
    const fresh = await documentsApi.version(document.value.current_version.guid)
    if (!active) return
    applyVersion(fresh)
    schedulePoll()
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
      stopPolling()
      clearSource()
      disposeDecorations()
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
  globalThis.document.addEventListener('visibilitychange', onFocus)
})

onUnmounted(() => {
  if (beforeLogout) beforeLogout.value = null
  active = false
  saver.value?.dispose()
  stopPolling()
  clearSource()
  disposeDecorations()
  window.removeEventListener('beforeunload', beforeUnload)
  window.removeEventListener('focus', onFocus)
  globalThis.document.removeEventListener('visibilitychange', onFocus)
})
</script>

<template>
  <ProcessingOverlay
    v-if="(busy && !document) || processing"
    :loading="!document"
    :conversion-status="document?.current_version.conversion_status"
    :guid="guid"
  />

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
          (saver.saving.value || decorationSaving
            ? 'Menyimpan…'
            : dirty
              ? 'Belum tersimpan'
              : saver.savedAt.value
                ? `Tersimpan ${dateLabel(new Date(saver.savedAt.value).toISOString())}`
                : 'Tersimpan')
        }}
      </p>
      <BaseButton
        :loading="saver.saving.value || decorationSaving"
        :disabled="!editable || busy || decorationSaving"
        @click="flush"
        >{{ saver.error.value ? 'Coba simpan lagi' : 'Simpan' }}</BaseButton
      >
    </div>
  </div>

  <FeedbackMessage :message="error || editorError" error />
  <FeedbackMessage :message="message" />
  <button
    v-if="document"
    class="mb-4 min-h-11 text-xs text-primary underline"
    :disabled="busy || decorationSaving"
    @click="refreshMetadata"
  >
    Periksa status versi
  </button>
  <p v-for="(text, key) in fields" :key="key" class="mb-2 text-sm text-error">{{ text }}</p>
  <p v-if="busy && !document" role="status">Memuat draft…</p>
  <button v-if="error && !document" class="min-h-11 text-primary underline" @click="load">
    Coba lagi
  </button>

  <template v-if="document">
    <ReadOnlyNotice
      v-if="!editable"
      :status="document.current_version.status"
      :not-current="document.current_version.is_current === false"
      :guid="guid"
      :local-content="locked && dirty ? JSON.stringify(content, null, 2) : undefined"
      :server-content="
        locked && serverVersion?.editor_data
          ? JSON.stringify(serverVersion.editor_data, null, 2)
          : undefined
      "
      @reload="router.go(0)"
    />

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
            @input="titleChanged"
        /></label>

        <DecorationSection
          kind="letterhead"
          title="Kop surat"
          :draft="decorations.letterhead"
          :has-saved="!!document.current_version.letterhead"
          :editable="editable"
          :busy="busy"
          :saving="decorationSaving"
          @choose="chooseDecoration('letterhead', $event)"
          @remove="removeDecoration('letterhead')"
          @edit="reviewed = false"
        />

        <label class="grid gap-2 text-xs font-semibold"> Isi Dokumen </label>
        <NativeEditor
          v-if="saver"
          :key="document.current_version.conversion_status"
          ref="editor"
          :data="content"
          :readonly="
            ['queued', 'processing'].includes(document.current_version.conversion_status ?? '')
          "
          @pending="pendingEditor = true"
          @change="changed"
          @invalid="editorError = $event"
        />

        <DecorationSection
          kind="footer"
          title="Footer"
          :draft="decorations.footer"
          :has-saved="!!document.current_version.footer"
          :editable="editable"
          :busy="busy"
          :saving="decorationSaving"
          @choose="chooseDecoration('footer', $event)"
          @remove="removeDecoration('footer')"
          @edit="reviewed = false"
        />

        <p class="text-xs text-muted">
          Posisi akhir kop, isi, footer, dan batas halaman mengikuti PDF pratinjau.
        </p>

        <section v-if="preview" class="rounded-xl border border-line bg-white p-5">
          <h2 class="mb-3 font-semibold">Preview PDF per halaman</h2>
          <PdfViewer
            :version-guid="document.current_version.guid"
            :expected-hash="document.current_version.content_hash"
          />
        </section>

        <p v-if="document.current_version.preview_status === 'failed'" class="text-sm text-error">
          {{
            document.current_version.preview_error_message ||
            'Preview PDF gagal dibuat. Periksa pilihan halaman kop/footer lalu coba lagi.'
          }}
        </p>

        <SourceSection
          :version="document.current_version"
          :editable="editable"
          :busy="busy"
          :import-uncertain="importUncertain"
          :source-url="sourceUrl"
          :source-busy="sourceBusy"
          @upload="upload"
          @retry="retryConversion"
          @open="openSource"
          @close="clearSource"
        />
      </section>

      <SignersForm
        v-if="stage === 1"
        :version-guid="document.current_version.guid"
        :assignments="document.current_version.assignments ?? []"
        :flush="flush"
        @dirty="extraDirty = $event"
        @saved="signersSaved"
      />

      <template v-if="stage === 2">
        <PlaceholderPanel
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
          <p
            v-if="document.current_version.preview_status === 'queued'"
            role="status"
            class="mt-3 text-sm"
          >
            Pratinjau sedang dibuat.
          </p>
          <p
            v-if="document.current_version.preview_status === 'failed'"
            class="mt-3 text-sm text-error"
          >
            {{
              document.current_version.preview_error_message ||
              'Pembuatan pratinjau gagal. Periksa status lalu coba lagi.'
            }}
          </p>
          <p class="mt-3 text-sm text-muted">
            Simpan isi dan penerima, lalu buat pratinjau dari editor terbaru.
          </p>
          <BaseButton
            class="mt-4"
            :disabled="
              busy ||
              dirty ||
              ['queued', 'processing', 'failed'].includes(
                document.current_version.conversion_status ?? '',
              )
            "
            @click="makePreview"
            >{{
              document.current_version.preview_status === 'queued'
                ? 'Periksa pratinjau'
                : 'Buat pratinjau terbaru'
            }}</BaseButton
          >
        </div>
      </template>

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
        <BaseButton
          class="mr-3"
          :disabled="
            busy ||
            dirty ||
            ['queued', 'processing', 'failed'].includes(
              document.current_version.conversion_status ?? '',
            )
          "
          @click="makePreview"
          >Buat pratinjau terbaru</BaseButton
        >
        <BaseButton :disabled="!canPublish || busy" :loading="busy" @click="publish"
          >Kirim untuk tanda tangan</BaseButton
        >
        <p class="mt-4 text-xs text-muted">
          Versi akan dikunci. Keberhasilan tidak membuktikan email sudah diterima.
        </p>
      </section>
    </div>
  </template>
</template>

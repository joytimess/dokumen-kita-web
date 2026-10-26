import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { documentsApi } from '../services/documents.service'
import { workspaceError } from '../services/workspace.errors'
import { notify } from '../services/feedback'
import type { DocumentRecord } from '../types/documents'
import {
  decorationKinds,
  decorationLabel,
  emptyDraft,
  rangeText,
  selectedPages,
  type DecorationDraft,
  type DecorationKind,
} from '../utils/decorations'

export type DecorationsContext = {
  document: Ref<DocumentRecord | undefined>
  editable: ComputedRef<boolean>
  reviewed: Ref<boolean>
  error: Ref<string>
  locked: Ref<boolean>
  isActive: () => boolean
  scheduleSave: () => void
  rebuildPreview: (guid: string) => Promise<void>
}

export function useDecorations(ctx: DecorationsContext) {
  const decorations = ref<Record<DecorationKind, DecorationDraft>>({
    letterhead: emptyDraft(),
    footer: emptyDraft(),
  })
  const controllers: Partial<Record<DecorationKind, AbortController>> = {}
  const selections: Record<DecorationKind, number> = { letterhead: 0, footer: 0 }
  const decorationSaving = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  function decorationDirty(kind: DecorationKind) {
    const draft = decorations.value[kind]
    const saved = ctx.document.value?.current_version[kind]
    if (draft.remove) return !!saved
    if (draft.file) return true
    if (!saved) return false
    const pages = selectedPages(draft)
    return !pages || JSON.stringify(pages) !== JSON.stringify(saved.pages)
  }

  const decorationsDirty = computed(() => decorationKinds.some(decorationDirty))

  watch(
    () =>
      decorationKinds.map((kind) => [
        decorations.value[kind].file,
        decorations.value[kind].mode,
        decorations.value[kind].ranges,
        decorations.value[kind].remove,
      ]),
    () => {
      clearTimeout(timer)
      if (
        ctx.editable.value &&
        decorationsDirty.value &&
        decorationKinds.every(
          (kind) =>
            decorations.value[kind].remove ||
            !decorationDirty(kind) ||
            selectedPages(decorations.value[kind]),
        )
      )
        timer = setTimeout(() => ctx.scheduleSave(), 1200)
    },
  )

  function clearImage(kind: DecorationKind) {
    selections[kind]++
    controllers[kind]?.abort()
    const url = decorations.value[kind].imageUrl
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    decorations.value[kind].imageUrl = ''
  }

  async function showSaved(kind: DecorationKind) {
    clearImage(kind)
    const version = ctx.document.value?.current_version
    if (!version?.[kind]) return
    const controller = new AbortController()
    controllers[kind] = controller
    try {
      const blob = await documentsApi.decorationImage(version.guid, kind, controller.signal)
      if (
        ctx.isActive() &&
        !controller.signal.aborted &&
        !decorations.value[kind].file &&
        !decorations.value[kind].remove
      )
        decorations.value[kind].imageUrl = URL.createObjectURL(blob)
    } catch (cause) {
      if (!controller.signal.aborted) ctx.error.value = workspaceError(cause).message
    }
  }

  function syncDecorations() {
    if (!ctx.document.value) return
    for (const kind of decorationKinds) {
      clearImage(kind)
      const saved = ctx.document.value.current_version[kind]
      decorations.value[kind] = {
        mode: saved?.pages.mode ?? 'all',
        ranges: rangeText(saved?.pages),
        remove: false,
        imageUrl: '',
      }
      void showSaved(kind)
    }
  }

  async function chooseDecoration(kind: DecorationKind, event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    const selection = ++selections[kind]
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2048 * 1024) {
      ctx.error.value = 'Pilih gambar PNG, JPEG, atau WebP maksimal 2 MB.'
      return
    }
    try {
      const image = await createImageBitmap(file)
      const valid = image.width <= 1200 && image.height <= 400
      image.close()
      if (!ctx.isActive() || selection !== selections[kind]) return
      if (!valid) {
        ctx.error.value = 'Gambar kop/footer maksimal 1200 × 400 piksel.'
        return
      }
    } catch {
      if (!ctx.isActive() || selection !== selections[kind]) return
      ctx.error.value = 'Gambar tidak dapat dibaca.'
      return
    }
    clearImage(kind)
    decorations.value[kind].file = file
    decorations.value[kind].remove = false
    decorations.value[kind].imageUrl = URL.createObjectURL(file)
    ctx.error.value = ''
    ctx.reviewed.value = false
  }

  function removeDecoration(kind: DecorationKind) {
    clearImage(kind)
    decorations.value[kind].file = undefined
    decorations.value[kind].remove = true
    ctx.reviewed.value = false
  }

  async function saveDecorations() {
    if (!ctx.document.value || decorationSaving.value) return false
    decorationSaving.value = true
    try {
      const guid = ctx.document.value.current_version.guid
      let changed = false
      for (const kind of decorationKinds) {
        if (!decorationDirty(kind)) continue
        const draft = decorations.value[kind]
        const removing = draft.remove
        const changingImage = !!draft.file
        const pages = selectedPages(draft)
        const label = decorationLabel[kind]
        if (!draft.remove && !pages) {
          ctx.error.value = `Rentang halaman ${label} tidak valid. Contoh: 1, 3-5.`
          return false
        }
        const current = ctx.document.value!.current_version
        const pageCount = current.preview_status === 'ready' ? current.preview_page_count : null
        if (
          pages?.mode === 'range' &&
          pageCount &&
          pages.ranges.some(([, end]) => end > pageCount)
        ) {
          ctx.error.value = `Rentang halaman ${label} melebihi ${pageCount} halaman preview. Perbaiki pilihannya.`
          return false
        }
        try {
          const version = draft.remove
            ? await documentsApi.deleteDecoration(guid, kind, current.editor_revision!)
            : await documentsApi.decoration(
                guid,
                kind,
                current.editor_revision!,
                pages!,
                draft.file,
              )
          if (!ctx.isActive() || ctx.document.value?.current_version.guid !== guid) return false
          ctx.document.value.current_version = {
            ...ctx.document.value.current_version,
            ...version,
            assignments: (ctx.document.value.current_version.assignments ?? []).map((a) => ({
              ...a,
              placeholders: a.placeholders?.map((p) => ({ ...p, needs_review: true })),
            })),
          }
          ctx.reviewed.value = false
          changed = true
          draft.file = undefined
          draft.remove = false
          draft.mode = version[kind]?.pages.mode ?? 'all'
          draft.ranges = rangeText(version[kind]?.pages)
          ctx.error.value = ''
          if (removing) notify.success(`${label} dihapus.`)
          else if (changingImage) notify.success(`Gambar ${label} tersimpan.`)
          void showSaved(kind)
        } catch (cause) {
          const feedback = workspaceError(cause)
          ctx.error.value = feedback.fields.file || feedback.fields.pages || feedback.message
          if ([401, 403, 409].includes(feedback.status ?? 0)) ctx.locked.value = true
          return false
        }
      }
      const status = ctx.document.value?.current_version.conversion_status ?? 'none'
      if (changed && !['queued', 'processing', 'failed'].includes(status)) {
        await ctx.rebuildPreview(guid)
      }
      return true
    } finally {
      decorationSaving.value = false
    }
  }

  function dispose() {
    clearTimeout(timer)
    for (const kind of decorationKinds) clearImage(kind)
  }

  return {
    decorations,
    decorationsDirty,
    decorationSaving,
    syncDecorations,
    chooseDecoration,
    removeDecoration,
    saveDecorations,
    dispose,
  }
}

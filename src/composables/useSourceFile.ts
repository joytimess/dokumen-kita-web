import { ref, type Ref } from 'vue'
import { documentsApi } from '../services/documents.service'
import { workspaceError } from '../services/workspace.errors'
import type { useWorkspaceRequest } from './useWorkspaceRequest'
import type { DocumentRecord, DocumentVersion, EditorData } from '../types/documents'

export type SourceFileContext = {
  guid: string
  document: Ref<DocumentRecord | undefined>
  content: Ref<EditorData>
  reviewed: Ref<boolean>
  message: Ref<string>
  error: Ref<string>
  busy: Ref<boolean>
  run: ReturnType<typeof useWorkspaceRequest>['run']
  flush: () => Promise<boolean>
  applyVersion: (version: DocumentVersion) => void
  refreshMetadata: () => Promise<void>
  stopPolling: () => void
  startPolling: () => void
  isActive: () => boolean
}

export function useSourceFile(ctx: SourceFileContext) {
  const sourceUrl = ref('')
  const sourceBusy = ref(false)
  const importUncertain = ref(false)
  let sourceController: AbortController | undefined

  function clearSource() {
    sourceController?.abort()
    if (sourceUrl.value) URL.revokeObjectURL(sourceUrl.value)
    sourceUrl.value = ''
  }

  async function upload(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || importUncertain.value) return
    clearSource()
    if (!/\.(pdf|docx)$/i.test(file.name) || file.size > 20480 * 1024) {
      ctx.error.value = 'Pilih PDF/DOCX maksimal 20.480 KB.'
      return
    }
    if (
      ctx.document.value?.current_version.has_source &&
      !window.confirm('Sumber lama akan diganti dan pratinjau tidak lagi siap. Lanjutkan?')
    )
      return
    if (!(await ctx.flush())) return
    const replace = !!ctx.content.value.blocks.length
    if (replace && !window.confirm('Hasil konversi akan mengganti isi editor. Lanjutkan?')) return
    ctx.stopPolling()
    const result = await ctx.run(async () => {
      try {
        return await documentsApi.import(
          ctx.guid,
          file,
          replace,
          ctx.document.value?.current_version.editor_revision,
        )
      } catch (cause) {
        if (workspaceError(cause).ambiguous) importUncertain.value = true
        throw cause
      }
    })
    ctx.reviewed.value = false
    if (result) {
      ctx.applyVersion(result)
      ctx.startPolling()
      ctx.message.value =
        'Dokumen sedang dikonversi. Isi editor akan tersedia setelah proses selesai.'
      await ctx.refreshMetadata()
      if (ctx.document.value?.current_version.conversion_status === 'ready')
        ctx.message.value = 'Konversi selesai. Periksa hasil editor.'
    } else if (importUncertain.value) await ctx.refreshMetadata()
  }

  async function retryConversion() {
    if (!(await ctx.flush())) return
    const replace = !!ctx.content.value.blocks.length
    if (replace && !window.confirm('Hasil konversi akan mengganti isi editor. Lanjutkan?')) return
    ctx.stopPolling()
    const result = await ctx.run(() =>
      documentsApi.retryConversion(
        ctx.document.value!.current_version.guid,
        replace,
        ctx.document.value?.current_version.editor_revision,
      ),
    )
    if (result) {
      ctx.applyVersion(result)
      ctx.startPolling()
    }
  }

  async function openSource() {
    clearSource()
    const controller = new AbortController()
    sourceController = controller
    sourceBusy.value = true
    try {
      const version = ctx.document.value!.current_version
      const blob = await documentsApi.source(version.guid, controller.signal)
      if (
        !ctx.isActive() ||
        controller.signal.aborted ||
        ctx.document.value?.current_version.guid !== version.guid
      )
        return
      const url = URL.createObjectURL(blob)
      if (version.source_type === 'docx') {
        const link = globalThis.document.createElement('a')
        link.href = url
        link.download = `${version.guid}.docx`
        link.click()
        URL.revokeObjectURL(url)
      } else sourceUrl.value = url
    } catch (cause) {
      if (!controller.signal.aborted) ctx.error.value = workspaceError(cause).message
    } finally {
      sourceBusy.value = false
    }
  }

  return {
    sourceUrl,
    sourceBusy,
    importUncertain,
    upload,
    retryConversion,
    openSource,
    clearSource,
  }
}

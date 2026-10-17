import { apiOrigin, authMode, csrf, http, mutation } from './http'
import type {
  Assignment,
  AuditEvent,
  DocumentRecord,
  DocumentVersion,
  EmailNotification,
  DraftPayload,
  Page,
  Placeholder,
  SignatureAsset,
  SignaturePayload,
  RevisionResult,
  DecorationPages,
} from '../types/documents'

async function get<T>(path: string, params?: Record<string, string | number>) {
  if (authMode !== 'api')
    throw new Error('Workspace memerlukan mode API. Tidak ada data contoh yang dibuat.')
  return (await http.get<T>(`${apiOrigin()}/api/v1${path}`, { params })).data
}
async function write<T>(path: string, payload: unknown, method: 'post' | 'put' | 'patch' = 'post') {
  if (authMode !== 'api') throw new Error('Workspace memerlukan mode API.')
  return (await mutation<{ data: T }>(`/api/v1${path}`, payload, method)).data
}
export const documentsApi = {
  list: (filters: { page?: number; status?: string; perPage?: number; q?: string; categoryGuid?: string; uncategorized?: boolean } = {}) =>
    get<Page<DocumentRecord>>('/documents', {
      page: filters.page ?? 1,
      per_page: filters.perPage ?? 15,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.q ? { q: filters.q } : {}),
      ...(filters.categoryGuid ? { category_guid: filters.categoryGuid } : {}),
      ...(filters.uncategorized ? { uncategorized: 1 } : {}),
    }),
  count: (status = '') =>
    get<Page<DocumentRecord>>('/documents', { page: 1, per_page: 1, ...(status ? { status } : {}) }),
  detail: (guid: string) =>
    get<{ data: DocumentRecord }>(`/documents/${encodeURIComponent(guid)}`).then((r) => r.data),
  assignCategory: (guid: string, categoryGuid: string | null) =>
    write<DocumentRecord>(`/documents/${encodeURIComponent(guid)}/category`, { category_guid: categoryGuid }, 'patch'),
  bulkAssignCategory: (documentGuids: string[], categoryGuid: string | null) =>
    write<{ updated_count: number; category_guid: string | null }>('/documents/categories', {
      document_guids: documentGuids,
      category_guid: categoryGuid,
    }, 'patch'),
  version: (guid: string) =>
    get<{ data: DocumentVersion }>(`/versions/${encodeURIComponent(guid)}`).then((r) => r.data),
  create: (title: string) => write<DocumentRecord>('/documents', { title }),
  save: (guid: string, payload: DraftPayload) =>
    write<DocumentVersion>(`/versions/${guid}`, payload, 'patch'),
  decoration: (guid: string, kind: 'letterhead' | 'footer', revision: number, pages: DecorationPages, file?: File) => {
    if (file) {
      const body = new FormData()
      body.append('editor_revision', String(revision))
      body.append('file', file)
      body.append('pages[mode]', pages.mode)
      if (pages.mode === 'range') pages.ranges.forEach(([start, end], index) => {
        body.append(`pages[ranges][${index}][0]`, String(start))
        body.append(`pages[ranges][${index}][1]`, String(end))
      })
      return write<DocumentVersion>(`/versions/${guid}/decorations/${kind}`, body)
    }
    return write<DocumentVersion>(`/versions/${guid}/decorations/${kind}`, { editor_revision: revision, pages }, 'patch')
  },
  deleteDecoration: async (guid: string, kind: 'letterhead' | 'footer', revision: number) => {
    await csrf()
    return (await http.delete<{ data: DocumentVersion }>(`${apiOrigin()}/api/v1/versions/${guid}/decorations/${kind}`, { data: { editor_revision: revision } })).data.data
  },
  async decorationImage(guid: string, kind: 'letterhead' | 'footer', signal?: AbortSignal) {
    return (await http.get<Blob>(`${apiOrigin()}/api/v1/versions/${guid}/decorations/${kind}/image`, { responseType: 'blob', signal })).data
  },
  import: (guid: string, file: File, replace = false, revision?: number) => {
    const body = new FormData()
    body.append('file', file)
    if (replace) {
      body.append('replace_editor_data', '1')
      body.append('editor_revision', String(revision))
    }
    return write<DocumentVersion>(`/documents/${guid}/imports`, body)
  },
  retryConversion: (guid: string, replace = false, revision?: number) =>
    write<DocumentVersion>(`/versions/${guid}/convert-import`, {
      replace_editor_data: replace,
      ...(replace ? { editor_revision: revision } : {}),
    }),
  preview: (guid: string) => write<DocumentVersion>(`/versions/${guid}/preview`, { source: 'editor' }),
  finalize: (guid: string) => write<DocumentVersion>(`/versions/${guid}/finalize`, {}),
  requestRevision: (guid: string, reason: string) =>
    write<RevisionResult>(`/assignments/${guid}/revision-request`, { reason }),
  reject: (guid: string, reason: string) =>
    write<{ assignment_guid: string; assignment_status: string; version_guid: string; version_status: string; reason: string }>(
      `/assignments/${guid}/reject`,
      { reason },
    ),
  audit: (guid: string, page = 1) => get<Page<AuditEvent>>(`/documents/${guid}/audit`, { page, per_page: 25 }),
  versions: (guid: string, page = 1) => get<Page<DocumentVersion>>(`/documents/${guid}/versions`, { page, per_page: 25 }),
  emails: (guid: string, page = 1) => get<Page<EmailNotification>>(`/documents/${guid}/emails`, { page, per_page: 25 }),
  async source(guid: string, signal?: AbortSignal) {
    return (await http.get<Blob>(`${apiOrigin()}/api/v1/versions/${guid}/source`, {
      responseType: 'blob', signal,
    })).data
  },
  signers: (guid: string, emails: string[]) =>
    write<DocumentVersion>(
      `/versions/${guid}/signers`,
      {
        signers: emails.map((email, index) => ({
          email: email.trim().toLowerCase(),
          sequence_number: index + 1,
        })),
      },
      'put',
    ),
  placeholders: (guid: string, placeholders: Placeholder[]) =>
    write<Assignment>(
      `/assignments/${guid}/placeholders`,
      {
        placeholders: placeholders.map(({ page_number, x, y, width, height }) => ({
          page_number,
          x,
          y,
          width,
          height,
        })),
      },
      'put',
    ),
  publish: (guid: string) => write<DocumentVersion>(`/versions/${guid}/publish`, {}),
  claim: (token: string) => write<Assignment>('/invitations/claim', { token }),
  resend: (guid: string) => write<Assignment>(`/assignments/${guid}/resend-invitation`, {}),
  read: (guid: string, hash: string) =>
    write<unknown>(`/assignments/${guid}/read-confirmation`, {
      confirmed: true,
      version_content_hash: hash,
    }),
  sign: (guid: string, payload: SignaturePayload) =>
    write<unknown>(`/assignments/${guid}/signatures`, payload),
  assets: (page = 1) => get<Page<SignatureAsset>>('/signature-assets', { page }),
  uploadAsset: (file: File, source: 'drawn' | 'upload') => {
    const body = new FormData()
    body.append('file', file)
    body.append('source_type', source)
    return write<SignatureAsset>('/signature-assets', body)
  },
  async assetImage(guid: string, signal?: AbortSignal) {
    return (
      await http.get<Blob>(`${apiOrigin()}/api/v1/signature-assets/${guid}/image`, {
        responseType: 'blob',
        signal,
      })
    ).data
  },
  async pdf(guid: string, signal?: AbortSignal) {
    const response = await http.get<ArrayBuffer>(`${apiOrigin()}/api/v1/versions/${guid}/pdf`, {
      responseType: 'arraybuffer',
      signal,
    })
    return {
      data: new Uint8Array(response.data),
      hash: String(response.headers['x-document-content-hash'] ?? ''),
    }
  },
}

import { afterEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { createAutosave } from '../src/composables/useAutosave'
import { createSignatureAction } from '../src/composables/useSignatureAction'
import { createReadGate } from '../src/utils/readGate'
import { afterAuthentication, workspaceDestination } from '../src/utils/authRedirect'
import { rememberInvitation, pendingInvitation, clearInvitation } from '../src/utils/invitation'
import {
  roundPosition,
  validPlaceholder,
  validSigners,
  areasReviewed,
  ownAssignment,
  expectedConversion,
  remoteVersionConflict,
  conversionFailure,
} from '../src/utils/documents'
import { documentsApi } from '../src/services/documents.service'
import { http } from '../src/services/http'
import { workspaceError } from '../src/services/workspace.errors'
import { findTextMatches } from '../src/utils/pdfSearch'
import type { Assignment, DocumentRecord, DocumentVersion } from '../src/types/documents'

vi.mock('../src/services/http', async (original) => ({
  ...(await original<typeof import('../src/services/http')>()),
  authMode: 'api',
}))
const originalAdapter = http.defaults.adapter
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  http.defaults.adapter = originalAdapter
  clearInvitation()
})
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function failure(status: number, code = '', headers = {}) {
  return new AxiosError('private details', undefined, undefined, undefined, {
    status,
    data: { error: { code } },
    headers,
  } as never)
}

describe('Autosave serial', () => {
  it('menolak revisi tab lain, tetapi menerima hasil konversi generasi aktif hanya saat lokal bersih', () => {
    const old = { guid: 'v', status: 'draft', editor_revision: 3, conversion_status: 'processing', conversion_generation: 'g1', preview_status: 'stale' } as DocumentVersion
    const converted = { ...old, editor_revision: 4, conversion_status: 'ready' } as DocumentVersion
    expect(expectedConversion(old, converted)).toBe(true)
    expect(remoteVersionConflict(old, converted, false, false, false)).toBe(false)
    expect(remoteVersionConflict(old, converted, true, false, false)).toBe(true)
    expect(remoteVersionConflict(old, converted, false, true, false)).toBe(true)
    expect(remoteVersionConflict(old, { ...converted, conversion_generation: 'g2' }, false, false, false)).toBe(true)
    expect(remoteVersionConflict(old, { ...old, editor_revision: 4 }, false, false, false)).toBe(true)
    expect(remoteVersionConflict(old, { ...old, is_current: false }, false, false, false)).toBe(true)
  })
  it('menjelaskan PDF scan tanpa menampilkan kode atau detail backend', () => {
    expect(conversionFailure('PDF_TEXT_LAYER_MISSING')).toContain('OCR')
    expect(conversionFailure('UNKNOWN_INTERNAL')).not.toContain('UNKNOWN_INTERNAL')
  })
  it('tidak save baseline dan menggabungkan perubahan selama 1000 ms', async () => {
    vi.useFakeTimers()
    const save = vi.fn(async () => {})
    const model = createAutosave({ title: 'A' }, save)
    model.change({ title: 'A' })
    await vi.advanceTimersByTimeAsync(1500)
    expect(save).not.toHaveBeenCalled()
    model.change({ title: 'B' })
    await vi.advanceTimersByTimeAsync(800)
    model.change({ title: 'C' })
    await vi.advanceTimersByTimeAsync(999)
    expect(save).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledExactlyOnceWith({ title: 'C' })
    expect(model.dirty.value).toBe(false)
    model.dispose()
  })
  it('maksimal satu save aktif; respons lama tidak menghapus perubahan berikutnya', async () => {
    const first = deferred<{ title: string }>(),
      second = deferred<{ title: string }>()
    const save = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const onSaved = vi.fn()
    const model = createAutosave({ title: 'A' }, save, { onSaved })
    model.change({ title: 'B' })
    const flush = model.flush()
    model.change({ title: 'C' })
    expect(model.flush()).toBe(flush)
    expect(save).toHaveBeenCalledTimes(1)
    first.resolve({ title: 'B normalized' })
    await Promise.resolve()
    expect(model.dirty.value).toBe(true)
    expect(save).toHaveBeenLastCalledWith({ title: 'C' })
    expect(onSaved).toHaveBeenLastCalledWith({ title: 'B normalized' }, false)
    second.resolve({ title: 'C normalized' })
    await flush
    expect(model.dirty.value).toBe(false)
    expect(onSaved).toHaveBeenLastCalledWith({ title: 'C normalized' }, true)
    model.dispose()
  })
  it('kegagalan mempertahankan dirty tanpa retry otomatis; flush melakukan retry eksplisit', async () => {
    vi.useFakeTimers()
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)
    const model = createAutosave('A', save)
    model.change('B')
    expect(await model.flush()).toBe(false)
    expect(model.dirty.value).toBe(true)
    expect(model.error.value).not.toBe('')
    await vi.advanceTimersByTimeAsync(10000)
    expect(save).toHaveBeenCalledTimes(1)
    expect(await model.flush()).toBe(true)
    model.dispose()
  })
  it('dispose saat request aktif menghentikan pengiriman data berikutnya ke sesi lain', async () => {
    const first = deferred<void>(),
      save = vi.fn(() => first.promise),
      model = createAutosave('A', save)
    model.change('B')
    const flush = model.flush()
    model.change('C')
    model.dispose()
    first.resolve()
    expect(await flush).toBe(false)
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('konflik yang menghentikan queue tidak dicoba ulang otomatis atau manual', async () => {
    const save = vi.fn(async () => {
      throw failure(409)
    })
    const model = createAutosave('A', save, { onError: () => true })
    model.change('B')
    await model.flush()
    await model.flush()
    expect(save).toHaveBeenCalledTimes(1)
    expect(model.dirty.value).toBe(true)
    model.dispose()
  })
})

describe('Gerbang baca', () => {
  it('mencari frasa lintas potongan teks dan menyediakan rentang highlight', () => {
    const matches = findTextMatches(['Dokumen', 'Kita adalah', 'dokumen kita'], 'dokumen kita')
    expect(matches).toHaveLength(2)
    expect(matches[0]!.segments).toEqual([
      { item: 0, start: 0, end: 7 },
      { item: 1, start: 0, end: 4 },
    ])
    expect(findTextMatches([], 'kode')).toEqual([])
  })
  it('lompat/search ke halaman terakhir tidak meloloskan halaman yang belum dikunjungi', () => {
    const model = createReadGate()
    model.reset(3)
    model.visit(3)
    model.end(3)
    expect(model.eligible.value).toBe(false)
    model.visit(1)
    model.visit(2)
    expect(model.eligible.value).toBe(false)
    model.end(3)
    expect(model.eligible.value).toBe(true)
  })
  it('satu halaman harus selesai dirender dan mencapai ujung; kegagalan/reset versi membatalkan', () => {
    const model = createReadGate()
    model.reset(1)
    model.end(1)
    expect(model.eligible.value).toBe(false)
    model.visit(1)
    expect(model.eligible.value).toBe(false)
    model.end(1)
    expect(model.eligible.value).toBe(true)
    model.error()
    expect(model.eligible.value).toBe(false)
    model.recovered()
    model.visit(1)
    model.end(1)
    expect(model.eligible.value).toBe(true)
    model.reset(2)
    expect(model.eligible.value).toBe(false)
  })
})

describe('Posisi dan penerima', () => {
  const area = { page_number: 1, x: 0.7, y: 0.8, width: 0.3, height: 0.2 }
  it('koordinat pecahan tetap pada batas halaman dengan presisi enam desimal', () => {
    expect(validPlaceholder(area, 2)).toBe(true)
    expect(roundPosition(0.123456789)).toBe(0.123457)
    expect(validPlaceholder({ ...area, width: 0.31 }, 2)).toBe(false)
    expect(validPlaceholder({ ...area, x: Number.NaN }, 2)).toBe(false)
    expect(validPlaceholder({ ...area, page_number: 0 }, 2)).toBe(false)
  })
  it('review dan area kosong memblokir publish', () => {
    const assignment = { placeholders: [area] } as Assignment
    expect(areasReviewed([assignment], 1)).toBe(true)
    expect(
      areasReviewed([{ ...assignment, placeholders: [{ ...area, needs_review: true }] }], 1),
    ).toBe(false)
    expect(areasReviewed([{ ...assignment, placeholders: [] }], 1)).toBe(false)
  })
  it('email dinormalisasi tanpa menghapus suffix plus atau titik; duplikasi ditolak', () => {
    expect(validSigners([' Test@example.com ', 'test@example.com'])).toBe(false)
    expect(validSigners(['a.b+work@example.com', 'ab@example.com'])).toBe(true)
    expect(validSigners([])).toBe(true)
    expect(validSigners(['invalid'])).toBe(false)
  })
  it('owner tidak mendapat hak signer dari urutan atau email tanpa klaim', () => {
    const document = {
      owner_guid: 'owner',
      current_version: {
        assignments: [{ recipient_email: 'owner@example.com', claimed_at: null }],
      },
    } as DocumentRecord
    expect(ownAssignment(document, { guid: 'owner', email: 'owner@example.com' })).toBeUndefined()
  })
})

describe('Redirect undangan', () => {
  it('tujuan umum menuju dashboard dan undangan bertahan melewati verifikasi', () => {
    expect(afterAuthentication(true, '/')).toBe('/dashboard')
    expect(afterAuthentication(true, '//evil.test')).toBe('/dashboard')
    expect(afterAuthentication(false, '/invitations/claim')).toBe(
      '/email/verify?redirect=%2Finvitations%2Fclaim',
    )
    expect(workspaceDestination('/forgot-password')).toBe('/forgot-password')
  })
  it('hanya menyimpan token sah, membersihkan setelah selesai/logout', () => {
    expect(rememberInvitation('a'.repeat(64))).toBe(true)
    expect(pendingInvitation()).toBe('a'.repeat(64))
    clearInvitation()
    expect(pendingInvitation()).toBe('')
    expect(rememberInvitation('invalid')).toBe(false)
  })
})

describe('Tanda tangan idempoten', () => {
  it('timeout dan retry memakai payload serta key identik tanpa optimisme signed', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ guid: 'signature' })
    const key = vi.fn(() => 'one-key')
    const model = createSignatureAction(send, key)
    await expect(model.sign('asset', 'hash')).rejects.toThrow('timeout')
    expect(model.completed.value).toBe(false)
    await model.sign('asset', 'hash')
    expect(model.completed.value).toBe(true)
    expect(key).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1])
    model.dispose()
  })
  it('menolak perubahan payload dan submit ganda ketika request berjalan', async () => {
    const pending = deferred<unknown>(),
      send = vi.fn(() => pending.promise),
      model = createSignatureAction(send, () => 'key')
    const first = model.sign('asset', 'hash')
    await model.sign('asset', 'hash')
    expect(send).toHaveBeenCalledTimes(1)
    pending.reject(new Error('offline'))
    await expect(first).rejects.toThrow()
    await expect(model.sign('other', 'hash')).rejects.toThrow('PAYLOAD_CHANGED')
    expect(send).toHaveBeenCalledTimes(1)
    model.dispose()
  })
})

describe('Adapter workspace dan kegagalan', () => {
  it('mengirim revisi editor, opsi penggantian impor, preview editor, dan alasan revisi sesuai kontrak', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    const calls: InternalAxiosRequestConfig[] = []
    http.defaults.adapter = async (config) => {
      calls.push(config)
      return { config, status: 202, data: { data: { guid: 'v' } }, statusText: 'Accepted', headers: new AxiosHeaders() }
    }
    await documentsApi.save('v', { editor_data: { blocks: [] }, editor_revision: 4 })
    await documentsApi.import('d', new File(['pdf'], 'test.pdf'), true, 5)
    await documentsApi.preview('v')
    await documentsApi.requestRevision('a', 'Perbaiki isi dokumen')
    const mutations = calls.filter((call) => call.method !== 'get')
    expect(JSON.parse(mutations[0]!.data)).toMatchObject({ editor_revision: 4 })
    expect(mutations[1]!.data).toBeInstanceOf(FormData)
    expect((mutations[1]!.data as FormData).get('replace_editor_data')).toBe('1')
    expect((mutations[1]!.data as FormData).get('editor_revision')).toBe('5')
    expect(JSON.parse(mutations[2]!.data)).toEqual({ source: 'editor' })
    expect(JSON.parse(mutations[3]!.data)).toEqual({ reason: 'Perbaiki isi dokumen' })
  })
  it('menggunakan PATCH/PUT multipart dan CSRF terbatas tanpa retry jaringan', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    const calls: InternalAxiosRequestConfig[] = []
    let fail = true
    http.defaults.adapter = async (config) => {
      calls.push(config)
      if (config.url?.endsWith('/versions/v') && fail) {
        fail = false
        throw failure(419)
      }
      return {
        config,
        status: 200,
        data: { data: { guid: 'v' } },
        statusText: 'OK',
        headers: new AxiosHeaders(),
      }
    }
    await documentsApi.save('v', { title: 'A' })
    expect(calls.map((c) => c.method)).toEqual(['get', 'patch', 'get', 'patch'])
    expect(JSON.parse(calls[1]!.data)).toEqual({ title: 'A' })
    calls.length = 0
    await documentsApi.signers('v', [' A@example.com ', 'b@example.com'])
    expect(calls[1]!.method).toBe('put')
    expect(JSON.parse(calls[1]!.data).signers[0]).toEqual({
      email: 'a@example.com',
      sequence_number: 1,
    })
    calls.length = 0
    http.defaults.adapter = async (config) => {
      calls.push(config)
      if (config.method === 'post') throw new AxiosError('timeout')
      return { config, status: 204, data: '', statusText: '', headers: new AxiosHeaders() }
    }
    await expect(documentsApi.create('A')).rejects.toThrow()
    expect(calls.filter((c) => c.method === 'post')).toHaveLength(1)
  })
  it('membuang guid/review dari body posisi dan menjaga assignment sebagai target', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:8000')
    const calls: InternalAxiosRequestConfig[] = []
    http.defaults.adapter = async (config) => {
      calls.push(config)
      return {
        config,
        status: 200,
        data: { data: {} },
        statusText: '',
        headers: new AxiosHeaders(),
      }
    }
    await documentsApi.placeholders('assignment-a', [
      {
        guid: 'area-a',
        page_number: 1,
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.1,
        needs_review: true,
      },
    ])
    expect(calls[1]!.url).toContain('/assignments/assignment-a/placeholders')
    expect(JSON.parse(calls[1]!.data).placeholders[0]).not.toHaveProperty('guid')
    expect(JSON.parse(calls[1]!.data).placeholders[0]).not.toHaveProperty('needs_review')
  })
  it('error tidak membocorkan pesan internal, 403 tidak selalu verifikasi, 429 mengikuti server', () => {
    expect(workspaceError(failure(403)).message).not.toContain('Verifikasi email')
    expect(workspaceError(failure(403, 'EMAIL_NOT_VERIFIED')).message).toContain('Verifikasi email')
    expect(workspaceError(failure(500)).message).not.toContain('private details')
    const feedback = workspaceError(failure(429, '', { 'retry-after': '120' }))
    expect(feedback.retryAt).toBeGreaterThan(Date.now() + 119000)
    expect(workspaceError(failure(409, 'IDEMPOTENCY_CONFLICT')).message).toContain('sebelumnya')
  })
})

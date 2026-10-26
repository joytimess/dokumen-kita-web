import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosHeaders } from 'axios'
import { http } from '../src/services/http'
import { documentsApi } from '../src/services/documents.service'
import { pdfDownloadFilename } from '../src/utils/pdfDownload'

describe('PDF download filename', () => {
  it.each([
    ['attachment; filename="Surat-completed-2026-10-26.pdf"', 'Surat-completed-2026-10-26.pdf'],
    ['attachment; filename=Surat.pdf', 'Surat.pdf'],
    ['attachment; filename="Surat; final.pdf"', 'Surat; final.pdf'],
    ["attachment; filename=ASCII.pdf; filename*=UTF-8''Surat-%E6%9D%B1%E4%BA%AC-%C3%A9.pdf", 'Surat-東京-é.pdf'],
    ["attachment; FILENAME*=utf-8'id'Persetujuan%20akhir.pdf; filename=ASCII.pdf", 'Persetujuan akhir.pdf'],
    ["attachment; filename*=UTF-8''Surat+akhir.pdf", 'Surat+akhir.pdf'],
    ["attachment; filename*=UTF-8''bad%ZZ.pdf; filename=Fallback.pdf", 'Fallback.pdf'],
    ["attachment; filename*=UTF-8''%FF.pdf; filename=Fallback.pdf", 'Fallback.pdf'],
    ["attachment; filename*=ISO-8859-1''caf%E9.pdf; filename=Fallback.pdf", 'Fallback.pdf'],
    ["attachment; filename*=UTF-8''..%2Fprivate.pdf; filename=Fallback.pdf", 'Fallback.pdf'],
  ])('uses the preferred valid backend filename: %s', (header, expected) => {
    expect(pdfDownloadFilename(header)).toBe(expected)
  })

  it.each([
    '', '   ', 'attachment', 'attachment; filename=""',
    'attachment; filename="unterminated.pdf',
    'attachment; filename="file.pdf"trailing',
    'attachment; filename="../../private.pdf"',
    'attachment; filename="C:\\private.pdf"',
    'attachment; filename="report.exe"',
    'attachment; filename="CON.pdf"',
    'attachment; filename="report\u0000.pdf"',
    'attachment; filename="report\u202e.pdf"',
    'attachment; filename="report.pdf"\r\nX-Other: value',
    "attachment; filename*=UTF-8''invalid%ZZ.pdf",
    "attachment; filename*=UTF-8''%00report.pdf",
    "attachment; filename*=UTF-8''..%5Cprivate.pdf",
    `attachment; filename="${'a'.repeat(252)}.pdf"`,
  ])('uses a safe PDF fallback for an absent or malformed filename: %s', (header) => {
    expect(pdfDownloadFilename(header)).toBe('dokumen.pdf')
  })
})

const adapter = http.defaults.adapter
beforeEach(() => { vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.test') })
afterEach(() => { http.defaults.adapter = adapter; vi.unstubAllEnvs() })

it.each([
  'attachment; filename="Surat-completed-2026-10-26.pdf"',
  "attachment; filename*=UTF-8''Persetujuan-%E6%9D%B1%E4%BA%AC.pdf",
  undefined,
])('preserves the download Blob and Content-Disposition through Axios: %s', async (contentDisposition) => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x80, 0xff, 0x00])
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const controller = new AbortController()
  http.defaults.adapter = async (config) => {
    expect(http.getUri(config)).toBe('https://api.example.test/api/v1/versions/version-guid/pdf?download=1')
    expect(config.responseType).toBe('blob')
    expect(config.signal).toBe(controller.signal)
    expect(config.withCredentials).toBe(true)
    return {
      config, status: 200, statusText: 'OK',
      headers: new AxiosHeaders({ 'Content-Type': 'application/pdf', 'Content-Disposition': contentDisposition }),
      data: blob,
    }
  }
  const result = await documentsApi.downloadPdf('version-guid', controller.signal)
  expect(result.data).toBe(blob)
  expect(new Uint8Array(await result.data.arrayBuffer())).toEqual(bytes)
  expect(result.contentDisposition).toBe(contentDisposition ?? '')
})

it('keeps the inline PDF request, bytes, hash and cancellation contract intact', async () => {
  const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])
  const controller = new AbortController()
  http.defaults.adapter = async (config) => {
    expect(http.getUri(config)).toBe('https://api.example.test/api/v1/versions/version-guid/pdf')
    expect(config.responseType).toBe('arraybuffer')
    expect(config.signal).toBe(controller.signal)
    return { config, status: 200, statusText: 'OK', headers: new AxiosHeaders({ 'x-document-content-hash': 'pdf-hash' }), data: bytes.buffer }
  }
  const result = await documentsApi.pdf('version-guid', controller.signal)
  expect(result.data).toEqual(bytes)
  expect(result.hash).toBe('pdf-hash')
})

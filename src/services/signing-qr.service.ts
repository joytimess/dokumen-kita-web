import { apiOrigin, http, mutation } from './http'
export type SigningQrMetadata = { status: string; signing_url: string; svg_url: string }
export type SigningQrAccess = { status: string; document_guid?: string; version_guid?: string; assignment_guid?: string }
export const signingQrApi = {
  async metadata(version: string) {
    return (await http.get<{ data: SigningQrMetadata }>(`${apiOrigin()}/api/v1/versions/${version}/signing-qr`)).data.data
  },
  async image(version: string, download = false) {
    return (await http.get<Blob>(`${apiOrigin()}/api/v1/versions/${version}/signing-qr.svg${download ? '?download=1' : ''}`, { responseType: 'blob' })).data
  },
  async resolve(token: string) {
    return (await mutation<{ data: SigningQrAccess }>('/api/v1/signing-qr/resolve', { token })).data
  },
  async claim(token: string) {
    return (await mutation<{ data: SigningQrAccess }>('/api/v1/signing-qr/claim', { token })).data
  },
}

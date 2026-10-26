import { AxiosError } from 'axios'
import { apiOrigin, http } from './http'

export async function getImage(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await http.get<unknown>(`${apiOrigin()}${path}`, { responseType: 'blob', signal })
  const invalid = (message: string) => new AxiosError(
    message, AxiosError.ERR_BAD_RESPONSE, response.config, response.request, response,
  )
  const data = response.data
  if (!(data instanceof Blob) && !(data instanceof ArrayBuffer))
    throw invalid('Respons gambar harus berupa binary Blob atau ArrayBuffer.')

  const blob = data instanceof Blob ? data : new Blob([data])
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
  let mime = ''
  if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte))
    mime = 'image/png'
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    mime = 'image/jpeg'
  else if ([0x52, 0x49, 0x46, 0x46].every((byte, index) => bytes[index] === byte) &&
    [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[index + 8] === byte))
    mime = 'image/webp'
  if (!mime) throw invalid('Respons gambar bukan binary PNG, JPEG, atau WebP yang dikenali.')

  // Set the MIME from the bytes without decoding binary data as text.
  return blob.type === mime ? blob : blob.slice(0, blob.size, mime)
}

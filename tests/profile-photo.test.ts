import { describe, expect, it, vi } from 'vitest'
import { exportProfilePhoto, profilePhotoMaxBytes, validProfilePhoto } from '../src/utils/profilePhoto'

function cropper(blob: Blob | null) {
  const toBlob = vi.fn((callback: BlobCallback) => callback(blob))
  const getCroppedCanvas = vi.fn(() => ({ toBlob }) as unknown as HTMLCanvasElement)
  return { getCroppedCanvas, toBlob }
}

describe('Profile photo validation and export', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts %s through 8 MB', (type) => {
    expect(validProfilePhoto({ type, size: profilePhotoMaxBytes })).toBe(true)
    expect(validProfilePhoto({ type, size: profilePhotoMaxBytes + 1 })).toBe(false)
  })
  it.each(['image/gif', 'image/svg+xml', 'text/plain', ''])('rejects unsupported %s', (type) => {
    expect(validProfilePhoto({ type, size: 100 })).toBe(false)
  })
  it('requests a square 512px JPEG at quality 0.9, with an opaque background', async () => {
    const source = cropper(new Blob(['photo'], { type: 'image/jpeg' }))
    const file = await exportProfilePhoto(source)
    expect(source.getCroppedCanvas).toHaveBeenCalledWith({ width: 512, height: 512, fillColor: '#fff', imageSmoothingQuality: 'high' })
    expect(source.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.9)
    expect(file).toMatchObject({ name: 'profile-photo.jpg', type: 'image/jpeg', size: 5 })
  })
  it('rejects a failed canvas export', async () => {
    await expect(exportProfilePhoto(cropper(null))).rejects.toThrow('Invalid cropped photo')
  })
  it('rejects an oversized exported image', async () => {
    await expect(exportProfilePhoto(cropper(new Blob([new Uint8Array(profilePhotoMaxBytes + 1)], { type: 'image/jpeg' })))).rejects.toThrow()
  })
  it('propagates canvas failures so the modal can show an error and retry', async () => {
    const source = cropper(null)
    source.getCroppedCanvas.mockImplementationOnce(() => { throw new Error('canvas failed') })
    await expect(exportProfilePhoto(source)).rejects.toThrow('canvas failed')
    source.getCroppedCanvas.mockReturnValue({ toBlob: (callback: BlobCallback) => callback(new Blob(['retry'], { type: 'image/jpeg' })) } as HTMLCanvasElement)
    expect(await exportProfilePhoto(source)).toMatchObject({ size: 5 })
  })
})

import type Cropper from 'cropperjs'

export const profilePhotoMaxBytes = 8 * 1024 * 1024

export function validProfilePhoto(file: Pick<File, 'type' | 'size'>) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= profilePhotoMaxBytes
}

export async function exportProfilePhoto(cropper: Pick<Cropper, 'getCroppedCanvas'>) {
  const canvas = cropper.getCroppedCanvas({ width: 512, height: 512, fillColor: '#fff', imageSmoothingQuality: 'high' })
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob || !validProfilePhoto(blob)) throw new Error('Invalid cropped photo')
  return new File([blob], 'profile-photo.jpg', { type: 'image/jpeg' })
}

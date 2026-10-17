import type { CategoryColor } from '../types/documents'

export const categoryColors: { value: CategoryColor; label: string; classes: string }[] = [
  { value: 'gray', label: 'Abu-abu', classes: 'border-gray-300 bg-gray-100 text-gray-800' },
  { value: 'blue', label: 'Biru', classes: 'border-blue-300 bg-blue-100 text-blue-800' },
  { value: 'green', label: 'Hijau', classes: 'border-green-300 bg-green-100 text-green-800' },
  { value: 'yellow', label: 'Kuning', classes: 'border-yellow-300 bg-yellow-100 text-yellow-900' },
  { value: 'orange', label: 'Oranye', classes: 'border-orange-300 bg-orange-100 text-orange-900' },
  { value: 'red', label: 'Merah', classes: 'border-red-300 bg-red-100 text-red-800' },
  { value: 'purple', label: 'Ungu', classes: 'border-purple-300 bg-purple-100 text-purple-800' },
]

export function categoryColorClass(token?: string) {
  return categoryColors.find((item) => item.value === token)?.classes ?? categoryColors[0]!.classes
}

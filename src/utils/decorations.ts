import type { DecorationPages } from '../types/documents'

export type DecorationKind = 'letterhead' | 'footer'

export type DecorationDraft = {
  file?: File
  mode: 'all' | 'range'
  ranges: string
  remove: boolean
  imageUrl: string
}

export const decorationKinds: DecorationKind[] = ['letterhead', 'footer']

export const decorationLabel: Record<DecorationKind, string> = {
  letterhead: 'kop surat',
  footer: 'footer',
}

export function emptyDraft(): DecorationDraft {
  return { mode: 'all', ranges: '', remove: false, imageUrl: '' }
}

export function rangeText(pages?: DecorationPages) {
  return pages?.mode === 'range'
    ? pages.ranges
        .map(([start, end]) => (start === end ? String(start) : `${start}-${end}`))
        .join(', ')
    : ''
}

export function selectedPages(draft: DecorationDraft): DecorationPages | null {
  if (draft.mode === 'all') return { mode: 'all' }
  const parts = draft.ranges.split(',').map((part) => part.trim())
  if (!parts.length || parts.some((part) => !/^\d+(?:\s*-\s*\d+)?$/.test(part))) return null
  const ranges = parts
    .map((part): [number, number] => {
      const [start, end] = part.split(/\s*-\s*/).map(Number)
      return [start, end ?? start]
    })
    .sort((a, b) => a[0] - b[0])
  if (
    ranges.some(
      ([start, end], index) =>
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 1 ||
        end < start ||
        (index > 0 && start <= ranges[index - 1]![1]),
    )
  )
    return null
  return { mode: 'range', ranges }
}

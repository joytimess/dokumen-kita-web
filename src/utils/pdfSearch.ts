import type { DocumentOcrMatch, DocumentOcrPoint } from '../types/documents'

export interface TextMatch {
  item: number
  offset: number
  segments: { item: number; start: number; end: number }[]
}
export function visibleOcrMatches(
  matches: DocumentOcrMatch[],
  nativeHits: { page: number; matchedText: string }[],
): DocumentOcrMatch[] {
  const nativeText = new Map<number, Set<string>>()
  for (const hit of nativeHits) {
    const texts = nativeText.get(hit.page) ?? new Set<string>()
    texts.add(hit.matchedText.trim().toLowerCase().replace(/\s+/g, ' '))
    nativeText.set(hit.page, texts)
  }
  return matches.filter((match) =>
    !nativeText.get(match.page_number)?.has(match.matched_text.trim().toLowerCase().replace(/\s+/g, ' ')),
  )
}
export function ocrPolygonPoints(polygon: DocumentOcrPoint[]): string {
  return polygon.map(([x, y]) => `${x},${y}`).join(' ')
}
export function findTextMatches(items: string[], query: string): TextMatch[] {
  const term = query.trim().toLowerCase()
  if (!term) return []
  const starts: number[] = []
  let text = ''
  items.forEach((item) => {
    starts.push(text.length)
    text += item + ' '
  })
  const haystack = text.toLowerCase(),
    matches: TextMatch[] = []
  let offset = haystack.indexOf(term)
  while (offset >= 0) {
    const end = offset + term.length
    const segments = items.flatMap((item, index) => {
      const start = starts[index]!,
        left = Math.max(0, offset - start),
        right = Math.min(item.length, end - start)
      return right > left ? [{ item: index, start: left, end: right }] : []
    })
    if (segments.length)
      matches.push({ item: segments[0]!.item, offset: segments[0]!.start, segments })
    offset = haystack.indexOf(term, end)
  }
  return matches
}

export function textMatchSnippet(items: string[], match: TextMatch, context = 36): string {
  const starts: number[] = []
  const text = items.map((item, index) => {
    starts.push(index ? starts[index - 1]! + items[index - 1]!.length + 1 : 0)
    return item
  }).join(' ')
  const first = match.segments[0]!
  const last = match.segments.at(-1)!
  const start = starts[first.item]! + first.start
  const end = starts[last.item]! + last.end
  const from = Math.max(0, start - context)
  const to = Math.min(text.length, end + context)
  return `${from > 0 ? '…' : ''}${text.slice(from, to).replace(/\s+/g, ' ').trim()}${to < text.length ? '…' : ''}`
}

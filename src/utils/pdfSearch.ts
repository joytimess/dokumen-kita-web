export interface TextMatch {
  item: number
  offset: number
  segments: { item: number; start: number; end: number }[]
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

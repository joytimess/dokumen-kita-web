export function splitTableRanges(size: number, count: number): [number, number][] {
  if (!Number.isInteger(size) || !Number.isInteger(count) || size < 1 || count < 1 || count > size)
    throw new Error('Pembagian tabel tidak valid.')
  return Array.from({ length: count }, (_, index) => [Math.floor(index * size / count), Math.floor((index + 1) * size / count)])
}

export function nextSignatureTabIndex(key: string, index: number, length: number): number {
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % length
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index + length - 1) % length

  return index
}

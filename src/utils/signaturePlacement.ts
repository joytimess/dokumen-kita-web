import type { Placeholder } from '../types/documents'
import { roundPosition } from './documents'

export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se'
const colors = ['#21634c', '#7652c9', '#286da8', '#9b6b18']
export const recipientColor = (index: number) => colors[index % colors.length]!

export function resizePlaceholder(area: Placeholder, dx: number, dy: number, corner: ResizeCorner, minimum = { width: 0.05, height: 0.03 }) {
  const right = area.x + area.width, bottom = area.y + area.height
  const x = corner.includes('w') ? Math.max(0, Math.min(right - minimum.width, area.x + dx)) : area.x
  const y = corner.includes('n') ? Math.max(0, Math.min(bottom - minimum.height, area.y + dy)) : area.y
  const edgeX = corner.includes('e') ? Math.min(1, Math.max(x + minimum.width, right + dx)) : right
  const edgeY = corner.includes('s') ? Math.min(1, Math.max(y + minimum.height, bottom + dy)) : bottom
  return { x: roundPosition(x), y: roundPosition(y), width: roundPosition(edgeX - x), height: roundPosition(edgeY - y) }
}

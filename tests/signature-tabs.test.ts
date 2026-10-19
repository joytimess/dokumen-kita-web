import { describe, expect, it } from 'vitest'
import { nextSignatureTabIndex } from '../src/utils/signatureTabs'

describe('Navigasi tab tanda tangan', () => {
  it('berpindah dan membungkus urutan untuk tombol panah', () => {
    expect(nextSignatureTabIndex('ArrowRight', 2, 3)).toBe(0)
    expect(nextSignatureTabIndex('ArrowDown', 0, 3)).toBe(1)
    expect(nextSignatureTabIndex('ArrowLeft', 0, 3)).toBe(2)
    expect(nextSignatureTabIndex('ArrowUp', 2, 3)).toBe(1)
  })

  it('memilih tab pertama atau terakhir dan mengabaikan tombol lain', () => {
    expect(nextSignatureTabIndex('Home', 1, 3)).toBe(0)
    expect(nextSignatureTabIndex('End', 1, 3)).toBe(2)
    expect(nextSignatureTabIndex('Enter', 1, 3)).toBe(1)
  })
})

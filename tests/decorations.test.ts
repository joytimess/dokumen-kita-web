import { describe, expect, it } from 'vitest'
import { decorationLayout } from '../src/utils/decorations'

describe('ukuran kop/footer di editor mengikuti renderer PDF', () => {
  it('memenuhi lebar area A4 untuk gambar standar 1200 × 400', () => {
    expect(decorationLayout(1200, 400)).toEqual({ widthMm: 174, heightMm: 58, marginMm: 73 })
  })

  it('mempertahankan proporsi gambar lebar dan ruang minimum isi', () => {
    const layout = decorationLayout(1200, 100)
    expect(layout).toEqual({ widthMm: 174, heightMm: 14.5, marginMm: 45 })
  })

  it('membatasi tinggi gambar agar tidak menutupi isi', () => {
    expect(decorationLayout(400, 400)).toEqual({ widthMm: 58, heightMm: 58, marginMm: 73 })
  })
})

import { describe, expect, it } from 'vitest'
import { defaultSettings, normalizeSettings } from '../src/core/settings'

describe('normalizeSettings', () => {
  it('falls back to defaults for junk input', () => {
    expect(normalizeSettings(null)).toEqual(defaultSettings())
    expect(normalizeSettings('nope')).toEqual(defaultSettings())
  })

  it('never leaves the interval or direction list empty', () => {
    expect(normalizeSettings({ semitones: [] }).semitones).toEqual(defaultSettings().semitones)
    expect(normalizeSettings({ directions: [] }).directions).toEqual(defaultSettings().directions)
  })

  it('drops out-of-range intervals and sorts them', () => {
    expect(normalizeSettings({ semitones: [12, 0, 4, 99, 4] }).semitones).toEqual([4, 12])
  })

  it('orders a reversed custom range', () => {
    const s = normalizeSettings({ customLow: 72, customHigh: 48 })
    expect(s.customLow).toBe(48)
    expect(s.customHigh).toBe(72)
  })

  it('clamps difficulty values', () => {
    expect(normalizeSettings({ toleranceCents: 0 }).toleranceCents).toBe(5)
    expect(normalizeSettings({ toleranceCents: 5000 }).toleranceCents).toBe(100)
    expect(normalizeSettings({ holdMs: 10 }).holdMs).toBe(300)
    expect(normalizeSettings({ a4: 1 }).a4).toBe(390)
  })

  it('keeps 0 as "no interval timeout" instead of clamping it up', () => {
    expect(normalizeSettings({ targetTimeoutMs: 0 }).targetTimeoutMs).toBe(0)
    expect(normalizeSettings({ targetTimeoutMs: 500 }).targetTimeoutMs).toBe(3000)
    expect(normalizeSettings({ targetTimeoutMs: 999999 }).targetTimeoutMs).toBe(60000)
  })

  it('rejects an unknown range preset', () => {
    expect(normalizeSettings({ rangePresetId: 'tuba' }).rangePresetId).toBe(
      defaultSettings().rangePresetId,
    )
    expect(normalizeSettings({ rangePresetId: 'trombone-tenor' }).rangePresetId).toBe(
      'trombone-tenor',
    )
  })
})

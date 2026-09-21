import { describe, expect, it } from 'vitest'
import {
  centsBetween,
  freqToMidi,
  inRange,
  intervalBySemitones,
  midiToFreq,
  midiToName,
  nameToMidi,
  presetRange,
  RANGE_PRESETS,
} from '../src/core/music'

describe('note conversions', () => {
  it('anchors A4 at the concert pitch', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 6)
    expect(midiToFreq(69, 442)).toBeCloseTo(442, 6)
    expect(freqToMidi(440)).toBeCloseTo(69, 6)
  })

  it('round-trips names and midi numbers', () => {
    expect(nameToMidi('C4')).toBe(60)
    expect(nameToMidi('A4')).toBe(69)
    expect(nameToMidi('Bb4')).toBe(70)
    expect(nameToMidi('E2')).toBe(40)
    expect(midiToName(60)).toBe('C4')
    expect(midiToName(40)).toBe('E2')
    expect(midiToName(70)).toBe('A#4')
  })

  it('rejects nonsense', () => {
    expect(() => nameToMidi('H4')).toThrow()
    expect(() => nameToMidi('C')).toThrow()
  })

  it('knows a major sixth above C4 is A4', () => {
    const sixth = intervalBySemitones(9)
    expect(sixth.name).toBe('Major sixth')
    expect(midiToName(nameToMidi('C4') + sixth.semitones)).toBe('A4')
  })
})

describe('cents', () => {
  it('is zero at the target and 100 per semitone', () => {
    expect(centsBetween(440, 440)).toBeCloseTo(0, 9)
    expect(centsBetween(midiToFreq(70), midiToFreq(69))).toBeCloseTo(100, 6)
    expect(centsBetween(midiToFreq(68), midiToFreq(69))).toBeCloseTo(-100, 6)
  })
})

describe('range presets', () => {
  it('produces ascending, usable ranges', () => {
    for (const preset of RANGE_PRESETS) {
      const range = presetRange(preset)
      expect(range.high).toBeGreaterThan(range.low)
      // Every preset must at least fit an octave, or octave prompts vanish.
      expect(range.high - range.low).toBeGreaterThanOrEqual(12)
    }
  })

  it('places the tenor trombone from E2 to Bb4', () => {
    const tbn = RANGE_PRESETS.find((p) => p.id === 'trombone-tenor')!
    const range = presetRange(tbn)
    expect(midiToName(range.low)).toBe('E2')
    expect(midiToName(range.high)).toBe('A#4')
    expect(inRange(nameToMidi('C3'), range)).toBe(true)
    expect(inRange(nameToMidi('C2'), range)).toBe(false)
  })
})

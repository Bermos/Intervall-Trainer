/** Pure music-theory helpers. No DOM, no audio — all of this is unit tested. */

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Concert pitch of A4 in Hz. Configurable so orchestras at 442/443 are not left out. */
export const DEFAULT_A4 = 440

/** MIDI note number of A4. */
const A4_MIDI = 69

export function midiToFreq(midi: number, a4 = DEFAULT_A4): number {
  return a4 * Math.pow(2, (midi - A4_MIDI) / 12)
}

export function freqToMidi(freq: number, a4 = DEFAULT_A4): number {
  return A4_MIDI + 12 * Math.log2(freq / a4)
}

/** Scientific pitch notation, e.g. 60 -> "C4". */
export function midiToName(midi: number): string {
  const rounded = Math.round(midi)
  const pc = ((rounded % 12) + 12) % 12
  const octave = Math.floor(rounded / 12) - 1
  return `${NOTE_NAMES[pc]}${octave}`
}

/** Parses "C4", "F#3", "Bb2", "Eb5" into a MIDI note number. Throws on garbage. */
export function nameToMidi(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim())
  if (!m) throw new Error(`Not a note name: ${name}`)
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase() as 'C']
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (Number(m[3]) + 1) * 12 + base + accidental
}

/** Signed distance in cents from `freq` to `targetFreq`. Positive means sharp. */
export function centsBetween(freq: number, targetFreq: number): number {
  return 1200 * Math.log2(freq / targetFreq)
}

export interface Interval {
  /** Distance in semitones. Always positive; direction is applied separately. */
  semitones: number
  name: string
  short: string
}

export const INTERVALS: readonly Interval[] = [
  { semitones: 1, name: 'Minor second', short: 'm2' },
  { semitones: 2, name: 'Major second', short: 'M2' },
  { semitones: 3, name: 'Minor third', short: 'm3' },
  { semitones: 4, name: 'Major third', short: 'M3' },
  { semitones: 5, name: 'Perfect fourth', short: 'P4' },
  { semitones: 6, name: 'Tritone', short: 'TT' },
  { semitones: 7, name: 'Perfect fifth', short: 'P5' },
  { semitones: 8, name: 'Minor sixth', short: 'm6' },
  { semitones: 9, name: 'Major sixth', short: 'M6' },
  { semitones: 10, name: 'Minor seventh', short: 'm7' },
  { semitones: 11, name: 'Major seventh', short: 'M7' },
  { semitones: 12, name: 'Octave', short: 'P8' },
]

export function intervalBySemitones(semitones: number): Interval {
  const found = INTERVALS.find((i) => i.semitones === semitones)
  if (!found) throw new Error(`No interval for ${semitones} semitones`)
  return found
}

export type Direction = 'up' | 'down'

export interface Range {
  /** Inclusive MIDI bounds. */
  low: number
  high: number
}

export interface RangePreset {
  id: string
  label: string
  group: 'Voice' | 'Instrument'
  low: string
  high: string
  /** Rough note about where the preset comes from, shown in settings. */
  hint?: string
}

/**
 * Comfortable working ranges, not the extremes a specialist can reach.
 * Voice ranges follow the common choral classifications; the tenor trombone
 * range is the straight (no F-attachment) horn from low E to a safe high Bb.
 */
export const RANGE_PRESETS: readonly RangePreset[] = [
  { id: 'bass', label: 'Bass', group: 'Voice', low: 'E2', high: 'E4' },
  { id: 'baritone', label: 'Baritone', group: 'Voice', low: 'G2', high: 'G4' },
  { id: 'tenor', label: 'Tenor', group: 'Voice', low: 'C3', high: 'A4' },
  { id: 'alto', label: 'Alto', group: 'Voice', low: 'F3', high: 'D5' },
  { id: 'mezzo', label: 'Mezzo-soprano', group: 'Voice', low: 'A3', high: 'F5' },
  { id: 'soprano', label: 'Soprano', group: 'Voice', low: 'C4', high: 'A5' },
  {
    id: 'trombone-tenor',
    label: 'Tenor trombone',
    group: 'Instrument',
    low: 'E2',
    high: 'Bb4',
    hint: 'Straight tenor, no F attachment',
  },
  {
    id: 'trombone-tenor-f',
    label: 'Tenor trombone (F attachment)',
    group: 'Instrument',
    low: 'B1',
    high: 'Bb4',
    hint: 'Trigger extends down to B1',
  },
]

export function presetRange(preset: RangePreset): Range {
  return { low: nameToMidi(preset.low), high: nameToMidi(preset.high) }
}

export function rangeSpan(range: Range): number {
  return range.high - range.low
}

export function inRange(midi: number, range: Range): boolean {
  return midi >= range.low && midi <= range.high
}

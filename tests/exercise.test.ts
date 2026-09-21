import { describe, expect, it } from 'vitest'
import { candidates, nextExercise, sameExercise } from '../src/core/exercise'
import { inRange, nameToMidi } from '../src/core/music'

const range = { low: nameToMidi('C3'), high: nameToMidi('C5') }

describe('candidates', () => {
  it('keeps both notes inside the range', () => {
    const all = candidates({ range, semitones: [9, 12], directions: ['up', 'down'] })
    expect(all.length).toBeGreaterThan(0)
    for (const c of all) {
      expect(inRange(c.rootMidi, range)).toBe(true)
      expect(inRange(c.targetMidi, range)).toBe(true)
      expect(Math.abs(c.targetMidi - c.rootMidi)).toBe(c.interval.semitones)
    }
  })

  it('honours direction', () => {
    const up = candidates({ range, semitones: [7], directions: ['up'] })
    expect(up.every((c) => c.targetMidi > c.rootMidi)).toBe(true)
    const down = candidates({ range, semitones: [7], directions: ['down'] })
    expect(down.every((c) => c.targetMidi < c.rootMidi)).toBe(true)
  })

  it('returns nothing when the interval cannot fit', () => {
    const narrow = { low: 60, high: 66 }
    expect(candidates({ range: narrow, semitones: [12], directions: ['up'] })).toHaveLength(0)
  })
})

describe('nextExercise', () => {
  it('returns null instead of looping forever on an impossible range', () => {
    expect(
      nextExercise({ range: { low: 60, high: 66 }, semitones: [12], directions: ['up'] }),
    ).toBeNull()
  })

  it('avoids repeating the previous prompt', () => {
    const opts = { range, semitones: [9], directions: ['up'] as const }
    const first = nextExercise({ ...opts, directions: ['up'], random: () => 0 })!
    const second = nextExercise({
      ...opts,
      directions: ['up'],
      previous: first,
      random: () => 0,
    })!
    expect(sameExercise(first, second)).toBe(false)
  })

  it('still returns something when only one candidate exists', () => {
    // C3..C4 with an octave up leaves exactly one option.
    const single = { low: nameToMidi('C3'), high: nameToMidi('C4') }
    const opts = { range: single, semitones: [12], directions: ['up'] as const }
    const first = nextExercise({ ...opts, directions: ['up'] })!
    expect(first.rootMidi).toBe(nameToMidi('C3'))
    const again = nextExercise({ ...opts, directions: ['up'], previous: first })
    expect(again).not.toBeNull()
  })
})

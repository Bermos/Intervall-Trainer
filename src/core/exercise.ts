import {
  type Direction,
  type Interval,
  type Range,
  inRange,
  intervalBySemitones,
  midiToName,
} from './music'

export interface Exercise {
  rootMidi: number
  targetMidi: number
  interval: Interval
  direction: Direction
}

export interface GeneratorOptions {
  range: Range
  /** Semitone sizes the user has enabled. */
  semitones: number[]
  directions: Direction[]
  /** Previous exercise, used to avoid handing out the exact same prompt twice. */
  previous?: Exercise | null
  random?: () => number
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length) % items.length]
}

/**
 * Every (root, interval, direction) triple whose target also lands inside the
 * range. Enumerating is cheap (a few hundred candidates at most) and avoids the
 * rejection-sampling loop that would otherwise spin forever on a narrow range.
 */
export function candidates(opts: GeneratorOptions): Exercise[] {
  const out: Exercise[] = []
  for (const semitones of opts.semitones) {
    const interval = intervalBySemitones(semitones)
    for (const direction of opts.directions) {
      const step = direction === 'up' ? semitones : -semitones
      for (let root = opts.range.low; root <= opts.range.high; root++) {
        const target = root + step
        if (inRange(target, opts.range)) {
          out.push({ rootMidi: root, targetMidi: target, interval, direction })
        }
      }
    }
  }
  return out
}

export function sameExercise(a: Exercise | null | undefined, b: Exercise | null | undefined): boolean {
  if (!a || !b) return false
  return a.rootMidi === b.rootMidi && a.targetMidi === b.targetMidi && a.direction === b.direction
}

/** Returns null when no interval fits the range (e.g. octaves in a 7-semitone range). */
export function nextExercise(opts: GeneratorOptions): Exercise | null {
  const random = opts.random ?? Math.random
  const all = candidates(opts)
  if (all.length === 0) return null
  const fresh = all.filter((c) => !sameExercise(c, opts.previous))
  return pick(fresh.length > 0 ? fresh : all, random)
}

export function describe(ex: Exercise): string {
  return `${midiToName(ex.rootMidi)} → ${ex.interval.name.toLowerCase()} ${ex.direction} → ${midiToName(ex.targetMidi)}`
}

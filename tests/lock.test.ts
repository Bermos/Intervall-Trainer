import { describe, expect, it } from 'vitest'
import { LockTracker } from '../src/core/lock'
import { midiToFreq } from '../src/core/music'

const target = midiToFreq(69) // A4 = 440
const config = { toleranceCents: 25, holdMs: 1000, graceMs: 250 }

/** Frequency `cents` away from the target. */
function at(cents: number): number {
  return target * Math.pow(2, cents / 1200)
}

describe('LockTracker', () => {
  it('locks after holding the pitch for the configured time', () => {
    const lock = new LockTracker(config)
    let now = 0
    let locked = false
    for (let i = 0; i < 30; i++) {
      now += 50
      const update = lock.update(at(5), target, now)
      if (update.justLocked) {
        locked = true
        expect(now).toBeGreaterThanOrEqual(1000)
        break
      }
    }
    expect(locked).toBe(true)
  })

  it('does not lock on a pitch outside tolerance', () => {
    const lock = new LockTracker(config)
    let now = 0
    for (let i = 0; i < 60; i++) {
      now += 50
      expect(lock.update(at(40), target, now).justLocked).toBe(false)
    }
    expect(lock.update(at(40), target, now).state).toBe('close')
    expect(lock.update(at(300), target, now).state).toBe('searching')
  })

  it('resets progress when the pitch drifts away for longer than the grace period', () => {
    const lock = new LockTracker(config)
    let now = 0
    for (let i = 0; i < 10; i++) lock.update(at(0), target, (now += 50))
    expect(lock.progress).toBeGreaterThan(0.4)

    // A long excursion wipes the progress.
    lock.update(at(200), target, (now += 400))
    expect(lock.progress).toBe(0)
  })

  it('survives a short dropout without losing the hold', () => {
    const lock = new LockTracker(config)
    let now = 0
    for (let i = 0; i < 10; i++) lock.update(at(0), target, (now += 50))
    const before = lock.progress

    const dropout = lock.update(null, target, (now += 150))
    expect(dropout.state).toBe('locking')
    expect(dropout.progress).toBeCloseTo(before, 5)

    // The first frame back only re-anchors the clock; the one after it counts.
    expect(lock.update(at(0), target, (now += 50)).progress).toBeCloseTo(before, 5)
    expect(lock.update(at(0), target, (now += 50)).progress).toBeGreaterThan(before)
  })

  it('does not credit silence towards the hold', () => {
    const lock = new LockTracker(config)
    let now = 0
    lock.update(at(0), target, (now += 50))
    lock.update(at(0), target, (now += 50))
    const held = lock.progress
    lock.update(null, target, (now += 200))
    const resumed = lock.update(at(0), target, (now += 40))
    // The 200 ms of silence must not count towards the hold.
    expect(resumed.progress).toBeCloseTo(held, 5)
  })

  it('reports locked only once', () => {
    const lock = new LockTracker(config)
    let now = 0
    let lockedCount = 0
    for (let i = 0; i < 40; i++) {
      if (lock.update(at(0), target, (now += 50)).justLocked) lockedCount++
    }
    expect(lockedCount).toBe(1)
  })
})

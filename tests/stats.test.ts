import { describe, expect, it } from 'vitest'
import {
  type AttemptRecord,
  averageAbsCents,
  averageLockMs,
  averageMisses,
  createStatsStorage,
  dayKey,
  emptyStats,
  practiceStreak,
  recordAttempt,
  successRate,
} from '../src/core/stats'

function attempt(overrides: Partial<AttemptRecord> = {}): AttemptRecord {
  return {
    at: Date.now(),
    semitones: 9,
    direction: 'up',
    rootMidi: 60,
    targetMidi: 69,
    timeToLockMs: 2000,
    rootLockMs: 1200,
    misses: 0,
    meanAbsCents: 12,
    success: true,
    ...overrides,
  }
}

describe('recordAttempt', () => {
  it('accumulates totals without mutating the previous snapshot', () => {
    const before = emptyStats()
    const after = recordAttempt(before, attempt())
    expect(before.attempts).toBe(0)
    expect(after.attempts).toBe(1)
    expect(after.successes).toBe(1)
    expect(after.byInterval['9'].attempts).toBe(1)
  })

  it('tracks streaks and resets them on a failure', () => {
    let stats = emptyStats()
    stats = recordAttempt(stats, attempt())
    stats = recordAttempt(stats, attempt())
    expect(stats.currentStreak).toBe(2)
    expect(stats.bestStreak).toBe(2)

    stats = recordAttempt(stats, attempt({ success: false }))
    expect(stats.currentStreak).toBe(0)
    expect(stats.bestStreak).toBe(2)
  })

  it('only counts solved prompts towards the average lock time', () => {
    let stats = emptyStats()
    stats = recordAttempt(stats, attempt({ timeToLockMs: 1000 }))
    stats = recordAttempt(stats, attempt({ timeToLockMs: 3000 }))
    stats = recordAttempt(stats, attempt({ timeToLockMs: 99000, success: false }))
    expect(averageLockMs(stats.byInterval['9'])).toBe(2000)
    expect(successRate(stats.byInterval['9'])).toBeCloseTo(2 / 3, 6)
  })

  it('averages intonation and retries per interval', () => {
    let stats = emptyStats()
    stats = recordAttempt(stats, attempt({ meanAbsCents: 10, misses: 1 }))
    stats = recordAttempt(stats, attempt({ meanAbsCents: 20, misses: 3 }))
    expect(averageAbsCents(stats.byInterval['9'])).toBe(15)
    expect(averageMisses(stats.byInterval['9'])).toBe(2)
  })

  it('ignores missing cents samples rather than counting them as zero', () => {
    let stats = emptyStats()
    stats = recordAttempt(stats, attempt({ meanAbsCents: 20 }))
    stats = recordAttempt(stats, attempt({ meanAbsCents: null }))
    expect(averageAbsCents(stats.byInterval['9'])).toBe(20)
  })

  it('buckets by local day', () => {
    const at = new Date(2026, 2, 14, 9, 30).getTime()
    const stats = recordAttempt(emptyStats(), attempt({ at }))
    expect(stats.byDay[dayKey(at)].attempts).toBe(1)
    expect(dayKey(at)).toBe('2026-03-14')
  })

  it('caps the recent list', () => {
    let stats = emptyStats()
    for (let i = 0; i < 250; i++) stats = recordAttempt(stats, attempt())
    expect(stats.recent.length).toBe(200)
    expect(stats.attempts).toBe(250)
  })
})

describe('practiceStreak', () => {
  it('counts consecutive days back from today', () => {
    const day = 24 * 60 * 60 * 1000
    const now = new Date(2026, 5, 10, 12, 0).getTime()
    let stats = emptyStats()
    stats = recordAttempt(stats, attempt({ at: now }))
    stats = recordAttempt(stats, attempt({ at: now - day }))
    stats = recordAttempt(stats, attempt({ at: now - 2 * day }))
    // A gap at day 3 stops the count.
    stats = recordAttempt(stats, attempt({ at: now - 4 * day }))
    expect(practiceStreak(stats, now)).toBe(3)
  })

  it('is zero with no practice today', () => {
    expect(practiceStreak(emptyStats(), Date.now())).toBe(0)
  })
})

describe('createStatsStorage', () => {
  function fakeStorage(): Storage {
    const map = new Map<string, string>()
    return {
      get length() {
        return map.size
      },
      clear: () => map.clear(),
      getItem: (k) => map.get(k) ?? null,
      key: (i) => [...map.keys()][i] ?? null,
      removeItem: (k) => void map.delete(k),
      setItem: (k, v) => void map.set(k, v),
    }
  }

  it('round-trips through storage', () => {
    const storage = fakeStorage()
    const store = createStatsStorage(storage)
    store.write(recordAttempt(emptyStats(), attempt()))
    expect(createStatsStorage(storage).read().attempts).toBe(1)
  })

  it('falls back to empty stats on corrupt data', () => {
    const storage = fakeStorage()
    storage.setItem('intervall-trainer:stats:v1', '{not json')
    expect(createStatsStorage(storage).read().attempts).toBe(0)
  })

  it('clears', () => {
    const storage = fakeStorage()
    const store = createStatsStorage(storage)
    store.write(recordAttempt(emptyStats(), attempt()))
    store.clear()
    expect(store.read().attempts).toBe(0)
  })
})

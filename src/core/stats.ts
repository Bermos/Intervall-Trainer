/**
 * Practice statistics. Everything lives in localStorage — nothing leaves the
 * device, and the store degrades to an in-memory one when storage is blocked
 * (private mode, PWA on a locked-down browser).
 */

export interface AttemptRecord {
  /** Epoch ms of when the attempt finished. */
  at: number
  semitones: number
  direction: 'up' | 'down'
  rootMidi: number
  targetMidi: number
  /** Ms from the start of the interval step to the locked interval note. */
  timeToLockMs: number
  /** Ms spent locking the root note first, or null when the root step is off. */
  rootLockMs: number | null
  /**
   * How many times the interval note timed out and sent the player back to the
   * root before this prompt was resolved.
   */
  misses: number
  /** Mean absolute deviation in cents while locking, when we measured one. */
  meanAbsCents: number | null
  /** False when the user skipped or gave up on the prompt. */
  success: boolean
}

export interface IntervalStat {
  semitones: number
  attempts: number
  successes: number
  totalTimeMs: number
  totalAbsCents: number
  centsSamples: number
  misses: number
}

export interface DayStat {
  /** Local date as YYYY-MM-DD. */
  day: string
  attempts: number
  successes: number
  totalTimeMs: number
}

export interface StatsSnapshot {
  version: 1
  attempts: number
  successes: number
  bestStreak: number
  currentStreak: number
  byInterval: Record<string, IntervalStat>
  byDay: Record<string, DayStat>
  /** Most recent attempts, newest last. Capped to keep storage small. */
  recent: AttemptRecord[]
}

export const STORAGE_KEY = 'intervall-trainer:stats:v1'
const RECENT_LIMIT = 200
const DAY_LIMIT = 400

export function emptyStats(): StatsSnapshot {
  return {
    version: 1,
    attempts: 0,
    successes: 0,
    bestStreak: 0,
    currentStreak: 0,
    byInterval: {},
    byDay: {},
    recent: [],
  }
}

export function dayKey(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function recordAttempt(stats: StatsSnapshot, attempt: AttemptRecord): StatsSnapshot {
  const next: StatsSnapshot = {
    ...stats,
    byInterval: { ...stats.byInterval },
    byDay: { ...stats.byDay },
    recent: [...stats.recent, attempt].slice(-RECENT_LIMIT),
  }

  next.attempts += 1
  if (attempt.success) {
    next.successes += 1
    next.currentStreak += 1
    next.bestStreak = Math.max(next.bestStreak, next.currentStreak)
  } else {
    next.currentStreak = 0
  }

  const key = String(attempt.semitones)
  const iv = next.byInterval[key] ?? {
    semitones: attempt.semitones,
    attempts: 0,
    successes: 0,
    totalTimeMs: 0,
    totalAbsCents: 0,
    centsSamples: 0,
    misses: 0,
  }
  next.byInterval[key] = {
    ...iv,
    attempts: iv.attempts + 1,
    successes: iv.successes + (attempt.success ? 1 : 0),
    totalTimeMs: iv.totalTimeMs + (attempt.success ? attempt.timeToLockMs : 0),
    totalAbsCents: iv.totalAbsCents + (attempt.meanAbsCents ?? 0),
    centsSamples: iv.centsSamples + (attempt.meanAbsCents === null ? 0 : 1),
    misses: iv.misses + attempt.misses,
  }

  const dk = dayKey(attempt.at)
  const day = next.byDay[dk] ?? { day: dk, attempts: 0, successes: 0, totalTimeMs: 0 }
  next.byDay[dk] = {
    ...day,
    attempts: day.attempts + 1,
    successes: day.successes + (attempt.success ? 1 : 0),
    totalTimeMs: day.totalTimeMs + (attempt.success ? attempt.timeToLockMs : 0),
  }

  const days = Object.keys(next.byDay).sort()
  if (days.length > DAY_LIMIT) {
    for (const d of days.slice(0, days.length - DAY_LIMIT)) delete next.byDay[d]
  }

  return next
}

export function successRate(stat: { attempts: number; successes: number }): number {
  return stat.attempts === 0 ? 0 : stat.successes / stat.attempts
}

export function averageLockMs(stat: IntervalStat): number | null {
  return stat.successes === 0 ? null : stat.totalTimeMs / stat.successes
}

export function averageAbsCents(stat: IntervalStat): number | null {
  return stat.centsSamples === 0 ? null : stat.totalAbsCents / stat.centsSamples
}

/** Average number of timeouts per prompt: the clearest "this one is hard" signal. */
export function averageMisses(stat: IntervalStat): number | null {
  return stat.attempts === 0 ? null : stat.misses / stat.attempts
}

/**
 * Consecutive days with at least one attempt, counting back from today.
 * Takes a readonly view so it can be called straight from a `readonly()` ref.
 */
export function practiceStreak(
  stats: { readonly byDay: { readonly [day: string]: unknown } },
  now = Date.now(),
): number {
  let streak = 0
  const cursor = new Date(now)
  // A session finished after midnight should not break yesterday's streak, so
  // start counting at today and walk backwards.
  for (;;) {
    const key = dayKey(cursor.getTime())
    if (!stats.byDay[key]) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export interface StatsStorage {
  read(): StatsSnapshot
  write(stats: StatsSnapshot): void
  clear(): void
}

function memoryStorage(initial = emptyStats()): StatsStorage {
  let value = initial
  return {
    read: () => value,
    write: (s) => {
      value = s
    },
    clear: () => {
      value = emptyStats()
    },
  }
}

export function createStatsStorage(storage?: Storage): StatsStorage {
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  if (!target) return memoryStorage()
  try {
    target.setItem(`${STORAGE_KEY}:probe`, '1')
    target.removeItem(`${STORAGE_KEY}:probe`)
  } catch {
    return memoryStorage()
  }
  return {
    read() {
      try {
        const raw = target.getItem(STORAGE_KEY)
        if (!raw) return emptyStats()
        const parsed = JSON.parse(raw) as StatsSnapshot
        if (parsed?.version !== 1) return emptyStats()
        return { ...emptyStats(), ...parsed }
      } catch {
        return emptyStats()
      }
    },
    write(stats) {
      try {
        target.setItem(STORAGE_KEY, JSON.stringify(stats))
      } catch {
        /* quota or blocked storage: stats are a nice-to-have, never a hard error */
      }
    },
    clear() {
      try {
        target.removeItem(STORAGE_KEY)
      } catch {
        /* ignore */
      }
    },
  }
}

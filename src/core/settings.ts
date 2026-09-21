import { DEFAULT_A4, type Direction, RANGE_PRESETS, nameToMidi } from './music'
import { DEFAULT_LOCK } from './lock'

export interface Settings {
  version: 1
  rangePresetId: string
  /** Used when rangePresetId is 'custom'. MIDI note numbers. */
  customLow: number
  customHigh: number
  semitones: number[]
  directions: Direction[]
  toleranceCents: number
  holdMs: number
  /**
   * How long the player gets on the interval note before we drop back to the
   * root. 0 disables the timeout and lets them keep hunting.
   */
  targetTimeoutMs: number
  /** Require the root to be sung/played (and locked) before the interval. */
  requireRoot: boolean
  a4: number
  /** Play the root note through the speakers at the start of each prompt. */
  playRoot: boolean
  /** Also play the target — training intonation rather than the ear. */
  playTarget: boolean
  /** Hide the target note name until the prompt is solved. */
  earTrainingMode: boolean
  /** Instrument timbre for the reference tone. */
  tone: 'sine' | 'triangle' | 'brass'
}

export const CUSTOM_RANGE_ID = 'custom'
export const SETTINGS_KEY = 'intervall-trainer:settings:v1'

export function defaultSettings(): Settings {
  return {
    version: 1,
    rangePresetId: 'tenor',
    customLow: nameToMidi('C3'),
    customHigh: nameToMidi('A4'),
    semitones: [2, 3, 4, 5, 7, 9, 12],
    directions: ['up'],
    toleranceCents: DEFAULT_LOCK.toleranceCents,
    holdMs: DEFAULT_LOCK.holdMs,
    targetTimeoutMs: 15000,
    requireRoot: true,
    a4: DEFAULT_A4,
    playRoot: true,
    playTarget: false,
    earTrainingMode: false,
    tone: 'triangle',
  }
}

const RANGE_IDS = new Set<string>([...RANGE_PRESETS.map((p) => p.id), CUSTOM_RANGE_ID])

/** Repairs anything an older build (or a hand-edited localStorage) left behind. */
export function normalizeSettings(input: unknown): Settings {
  const base = defaultSettings()
  if (!input || typeof input !== 'object') return base
  const raw = input as Partial<Settings>

  const semitones = Array.isArray(raw.semitones)
    ? [...new Set(raw.semitones.filter((s) => Number.isInteger(s) && s >= 1 && s <= 12))].sort(
        (a, b) => a - b,
      )
    : base.semitones
  const directions = Array.isArray(raw.directions)
    ? (raw.directions.filter((d) => d === 'up' || d === 'down') as Direction[])
    : base.directions

  const low = clampMidi(raw.customLow ?? base.customLow, base.customLow)
  const high = clampMidi(raw.customHigh ?? base.customHigh, base.customHigh)

  return {
    version: 1,
    rangePresetId:
      typeof raw.rangePresetId === 'string' && RANGE_IDS.has(raw.rangePresetId)
        ? raw.rangePresetId
        : base.rangePresetId,
    customLow: Math.min(low, high),
    customHigh: Math.max(low, high),
    // An empty selection would make the generator unable to produce anything.
    semitones: semitones.length > 0 ? semitones : base.semitones,
    directions: directions.length > 0 ? directions : base.directions,
    toleranceCents: clamp(raw.toleranceCents ?? base.toleranceCents, 5, 100),
    holdMs: clamp(raw.holdMs ?? base.holdMs, 300, 5000),
    // 0 is a valid value meaning "no timeout", so it bypasses the clamp.
    targetTimeoutMs:
      raw.targetTimeoutMs === 0 ? 0 : clamp(raw.targetTimeoutMs ?? base.targetTimeoutMs, 3000, 60000),
    requireRoot: raw.requireRoot ?? base.requireRoot,
    a4: clamp(raw.a4 ?? base.a4, 390, 470),
    playRoot: raw.playRoot ?? base.playRoot,
    playTarget: raw.playTarget ?? base.playTarget,
    earTrainingMode: raw.earTrainingMode ?? base.earTrainingMode,
    tone: raw.tone === 'sine' || raw.tone === 'brass' ? raw.tone : base.tone,
  }
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

function clampMidi(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.round(clamp(value, 24, 96))
}

export function loadSettings(storage?: Storage): Settings {
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  if (!target) return defaultSettings()
  try {
    const raw = target.getItem(SETTINGS_KEY)
    return normalizeSettings(raw ? JSON.parse(raw) : null)
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(settings: Settings, storage?: Storage): void {
  const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage)
  if (!target) return
  try {
    target.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    /* ignore: blocked or full storage must not break practice */
  }
}

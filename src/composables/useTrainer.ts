import { computed, reactive, readonly, ref, watch } from 'vue'
import { AudioEngine } from '../core/audio'
import { LockTracker, type LockState } from '../core/lock'
import { PitchSmoother, detectPitch } from '../core/pitch'
import { CUSTOM_RANGE_ID, type Settings, loadSettings, saveSettings } from '../core/settings'
import { RANGE_PRESETS, type Range, midiToFreq, midiToName, presetRange } from '../core/music'
import { type Exercise, candidates, nextExercise } from '../core/exercise'
import { type StatsSnapshot, createStatsStorage, emptyStats, recordAttempt } from '../core/stats'

export type TrainerPhase = 'idle' | 'prompting' | 'listening' | 'solved' | 'error'

/**
 * Which note the player is on. The root has to be locked first so the interval
 * is actually sung *from* something — otherwise this is just a tuner.
 */
export type Stage = 'root' | 'target'

export function useTrainer() {
  const engine = new AudioEngine()
  const statsStorage = createStatsStorage()
  const smoother = new PitchSmoother(5)
  const lock = new LockTracker()

  const settings = reactive<Settings>(loadSettings())
  const stats = ref<StatsSnapshot>(statsStorage.read())
  const phase = ref<TrainerPhase>('idle')
  const stage = ref<Stage>('root')
  const errorMessage = ref<string | null>(null)
  const exercise = ref<Exercise | null>(null)
  const revealed = ref(false)
  /** Timeouts on the interval note within the current prompt. */
  const misses = ref(0)
  /** 1 → 0 countdown for the interval step, or null when the timeout is off. */
  const timeoutRemaining = ref<number | null>(null)
  /** Set for a moment when a timeout bounces the player back to the root. */
  const bouncedBack = ref(false)

  const live = reactive({
    frequency: null as number | null,
    cents: null as number | null,
    clarity: 0,
    level: 0,
    progress: 0,
    lockState: 'idle' as LockState,
  })

  let rafId: number | null = null
  let stageStart = 0
  let rootLockMs: number | null = null
  let centsSum = 0
  let centsCount = 0
  let timers: number[] = []

  const range = computed<Range>(() => {
    if (settings.rangePresetId === CUSTOM_RANGE_ID) {
      return { low: settings.customLow, high: settings.customHigh }
    }
    const preset = RANGE_PRESETS.find((p) => p.id === settings.rangePresetId)
    return preset ? presetRange(preset) : { low: settings.customLow, high: settings.customHigh }
  })

  /** True when the current settings cannot produce a single valid prompt. */
  const settingsImpossible = computed(
    () =>
      candidates({
        range: range.value,
        semitones: settings.semitones,
        directions: settings.directions,
      }).length === 0,
  )

  const rootFreq = computed(() =>
    exercise.value ? midiToFreq(exercise.value.rootMidi, settings.a4) : null,
  )
  const targetFreq = computed(() =>
    exercise.value ? midiToFreq(exercise.value.targetMidi, settings.a4) : null,
  )
  /** The note the player should be producing right now. */
  const currentMidi = computed(() => {
    if (!exercise.value) return null
    return stage.value === 'root' ? exercise.value.rootMidi : exercise.value.targetMidi
  })
  const currentFreq = computed(() =>
    currentMidi.value === null ? null : midiToFreq(currentMidi.value, settings.a4),
  )
  const showTarget = computed(
    () => !settings.earTrainingMode || revealed.value || phase.value === 'solved',
  )

  watch(
    () => ({ ...settings }),
    (value) => {
      saveSettings(value as Settings)
      applyLockConfig()
    },
    { deep: true },
  )

  function applyLockConfig(): void {
    lock.configure({
      toleranceCents: settings.toleranceCents,
      holdMs: settings.holdMs,
      graceMs: 250,
    })
  }

  function later(fn: () => void, ms: number): void {
    timers.push(window.setTimeout(fn, ms))
  }

  function clearTimers(): void {
    timers.forEach((id) => clearTimeout(id))
    timers = []
  }

  async function start(): Promise<void> {
    errorMessage.value = null
    try {
      await engine.startMic()
    } catch (err) {
      phase.value = 'error'
      errorMessage.value =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow it in your browser settings, then try again.'
          : `Could not open the microphone: ${(err as Error).message}`
      return
    }
    applyLockConfig()
    await goToNext()
    if (rafId === null) loop()
  }

  function stop(): void {
    if (rafId !== null) cancelAnimationFrame(rafId)
    rafId = null
    clearTimers()
    engine.stopMic()
    phase.value = 'idle'
    exercise.value = null
    timeoutRemaining.value = null
    resetLive()
  }

  function resetLive(): void {
    live.frequency = null
    live.cents = null
    live.clarity = 0
    live.level = 0
    live.progress = 0
    live.lockState = 'idle'
  }

  async function goToNext(): Promise<void> {
    clearTimers()
    const next = nextExercise({
      range: range.value,
      semitones: settings.semitones,
      directions: settings.directions,
      previous: exercise.value,
    })
    if (!next) {
      phase.value = 'error'
      errorMessage.value =
        'No interval fits the selected range. Widen the range or enable smaller intervals.'
      return
    }
    exercise.value = next
    revealed.value = false
    misses.value = 0
    rootLockMs = null
    centsSum = 0
    centsCount = 0
    errorMessage.value = null
    await enterStage(settings.requireRoot ? 'root' : 'target', { playReference: true })
  }

  /** Starts a stage: optionally sounds the reference note, then opens the mic gate. */
  async function enterStage(next: Stage, opts: { playReference: boolean }): Promise<void> {
    const ex = exercise.value
    if (!ex) return
    stage.value = next
    smoother.reset()
    lock.reset()
    resetLive()
    phase.value = 'prompting'

    if (opts.playReference && settings.playRoot) {
      // Only the root is ever sounded automatically; sounding the target would
      // give the answer away. Settings can override that for intonation work.
      const shouldPlay = next === 'root' || settings.playTarget
      const midi = next === 'root' ? ex.rootMidi : ex.targetMidi
      if (shouldPlay) {
        await engine.playTone(midiToFreq(midi, settings.a4), 850, settings.tone)
        await wait(900)
      }
    }

    phase.value = 'listening'
    stageStart = performance.now()
    timeoutRemaining.value = next === 'target' && settings.targetTimeoutMs > 0 ? 1 : null
  }

  async function replayRoot(): Promise<void> {
    const ex = exercise.value
    if (!ex) return
    await engine.playTone(midiToFreq(ex.rootMidi, settings.a4), 850, settings.tone)
  }

  async function playTargetNote(): Promise<void> {
    const ex = exercise.value
    if (!ex) return
    revealed.value = true
    await engine.playTone(midiToFreq(ex.targetMidi, settings.a4), 850, settings.tone)
  }

  function loop(): void {
    rafId = requestAnimationFrame(loop)
    const frame = engine.readFrame()
    if (!frame) return

    const result = detectPitch(frame, engine.sampleRate)
    live.clarity = result.clarity
    live.level = result.rms
    const smoothed = smoother.push(result.frequency)
    live.frequency = smoothed

    if (phase.value !== 'listening' || currentFreq.value === null) return

    const now = performance.now()
    const update = lock.update(smoothed, currentFreq.value, now)
    live.cents = update.cents
    live.progress = update.progress
    live.lockState = update.state

    // Only the interval note feeds the intonation statistic; the root is a
    // reference the player was just handed, so it would flatter the numbers.
    if (stage.value === 'target' && update.cents !== null && update.state !== 'searching') {
      centsSum += Math.abs(update.cents)
      centsCount += 1
    }

    if (update.justLocked) {
      onStageLocked(now)
      return
    }

    if (stage.value === 'target' && settings.targetTimeoutMs > 0) {
      const elapsed = now - stageStart
      timeoutRemaining.value = Math.max(0, 1 - elapsed / settings.targetTimeoutMs)
      if (elapsed >= settings.targetTimeoutMs) onTargetTimeout()
    }
  }

  function onStageLocked(now: number): void {
    if (stage.value === 'root') {
      rootLockMs = Math.round(now - stageStart)
      phase.value = 'prompting'
      void engine.playTone(1320, 90, 'sine')
      // A beat between the two notes, so the player hears their own root settle
      // before reaching for the interval.
      later(() => void enterStage('target', { playReference: settings.playTarget }), 450)
      return
    }
    onSolved(now)
  }

  function onSolved(now: number): void {
    const ex = exercise.value
    if (!ex) return
    phase.value = 'solved'
    timeoutRemaining.value = null
    void engine.playSuccess()
    commit(ex, true, now - stageStart)
    later(() => void goToNext(), 900)
  }

  function onTargetTimeout(): void {
    misses.value += 1
    timeoutRemaining.value = null
    bouncedBack.value = true
    later(() => (bouncedBack.value = false), 1800)
    // Back to the root of the *same* interval: the point is to train this leap,
    // so rerolling here would let the player dodge the one they cannot hear.
    void enterStage(settings.requireRoot ? 'root' : 'target', { playReference: true })
  }

  function skip(): void {
    const ex = exercise.value
    if (!ex || phase.value === 'idle') return
    commit(ex, false, performance.now() - stageStart)
    void goToNext()
  }

  function commit(ex: Exercise, success: boolean, timeToLockMs: number): void {
    stats.value = recordAttempt(stats.value, {
      at: Date.now(),
      semitones: ex.interval.semitones,
      direction: ex.direction,
      rootMidi: ex.rootMidi,
      targetMidi: ex.targetMidi,
      timeToLockMs: Math.round(timeToLockMs),
      rootLockMs,
      misses: misses.value,
      meanAbsCents: centsCount > 0 ? centsSum / centsCount : null,
      success,
    })
    statsStorage.write(stats.value)
  }

  function clearStats(): void {
    statsStorage.clear()
    stats.value = emptyStats()
  }

  return {
    settings,
    stats: readonly(stats),
    phase: readonly(phase),
    stage: readonly(stage),
    errorMessage: readonly(errorMessage),
    exercise: readonly(exercise),
    live: readonly(live),
    misses: readonly(misses),
    timeoutRemaining: readonly(timeoutRemaining),
    bouncedBack: readonly(bouncedBack),
    range,
    rootFreq,
    targetFreq,
    currentMidi,
    currentFreq,
    showTarget,
    settingsImpossible,
    start,
    stop,
    skip,
    replayRoot,
    playTargetNote,
    reveal: () => (revealed.value = true),
    clearStats,
    noteName: midiToName,
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * Pitch detection with the McLeod Pitch Method (normalized square difference
 * function + peak picking). Chosen over plain autocorrelation because it is far
 * less prone to octave errors, which matter a lot here: an octave slip would
 * mark a correct interval as wrong.
 *
 * Pure functions over a Float32Array so the whole thing is testable without
 * Web Audio.
 */

export interface PitchResult {
  /** Detected fundamental in Hz, or null when nothing usable was found. */
  frequency: number | null
  /** NSDF value at the chosen peak, 0..1. Higher means more periodic. */
  clarity: number
  /** Root-mean-square of the frame, a rough input level. */
  rms: number
}

export interface PitchOptions {
  /** Frames quieter than this are treated as silence. */
  minRms?: number
  /** Peaks below this clarity are rejected. */
  minClarity?: number
  /** Fraction of the strongest NSDF peak a candidate must reach (MPM's k). */
  peakThreshold?: number
  minFrequency?: number
  maxFrequency?: number
}

const DEFAULTS: Required<PitchOptions> = {
  minRms: 0.012,
  minClarity: 0.85,
  peakThreshold: 0.9,
  minFrequency: 55, // A1, below anything in our presets
  maxFrequency: 1600, // above a soprano high C with headroom
}

export function rms(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / buffer.length)
}

/** Normalized square difference function, n'(tau) for tau in [0, maxTau). */
export function nsdf(buffer: Float32Array, maxTau: number): Float32Array {
  const w = buffer.length
  const out = new Float32Array(maxTau)
  let m = 0
  for (let j = 0; j < w; j++) m += 2 * buffer[j] * buffer[j]

  for (let tau = 0; tau < maxTau; tau++) {
    if (tau > 0) {
      m -= buffer[w - tau] * buffer[w - tau] + buffer[tau - 1] * buffer[tau - 1]
    }
    let r = 0
    for (let j = 0; j + tau < w; j++) r += buffer[j] * buffer[j + tau]
    out[tau] = m > 0 ? (2 * r) / m : 0
  }
  return out
}

/** Fits a parabola through (x-1, x, x+1) and returns the vertex position. */
function parabolicPeak(values: Float32Array, index: number): { x: number; y: number } {
  if (index <= 0 || index >= values.length - 1) return { x: index, y: values[index] }
  const a = values[index - 1]
  const b = values[index]
  const c = values[index + 1]
  const denom = a - 2 * b + c
  if (denom === 0) return { x: index, y: b }
  const shift = (0.5 * (a - c)) / denom
  return { x: index + shift, y: b - 0.25 * (a - c) * shift }
}

/**
 * Key maxima: the highest point of each hump between a positive-going and the
 * following negative-going zero crossing, skipping the peak at tau = 0.
 */
function keyMaxima(n: Float32Array): number[] {
  const maxima: number[] = []
  let tau = 1
  // Walk past the initial hump around tau = 0.
  while (tau < n.length - 1 && n[tau] > 0) tau++
  while (tau < n.length - 1 && n[tau] <= 0) tau++

  let best = -1
  while (tau < n.length - 1) {
    if (n[tau] > 0) {
      if (best < 0 || n[tau] > n[best]) best = tau
    } else if (best >= 0) {
      maxima.push(best)
      best = -1
      while (tau < n.length - 1 && n[tau] <= 0) tau++
      continue
    }
    tau++
  }
  if (best >= 0) maxima.push(best)
  return maxima
}

export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  options: PitchOptions = {},
): PitchResult {
  const opts = { ...DEFAULTS, ...options }
  const level = rms(buffer)
  if (level < opts.minRms) return { frequency: null, clarity: 0, rms: level }

  const minTau = Math.max(2, Math.floor(sampleRate / opts.maxFrequency))
  const maxTau = Math.min(buffer.length - 1, Math.ceil(sampleRate / opts.minFrequency) + 2)
  if (maxTau <= minTau) return { frequency: null, clarity: 0, rms: level }

  const n = nsdf(buffer, maxTau)
  const maxima = keyMaxima(n).filter((tau) => tau >= minTau)
  if (maxima.length === 0) return { frequency: null, clarity: 0, rms: level }

  let highest = maxima[0]
  for (const tau of maxima) if (n[tau] > n[highest]) highest = tau

  const threshold = opts.peakThreshold * n[highest]
  // The *first* peak clearing the threshold is the fundamental; later, taller
  // peaks are sub-octaves and picking them is exactly the octave error we avoid.
  const chosen = maxima.find((tau) => n[tau] >= threshold) ?? highest

  const { x, y } = parabolicPeak(n, chosen)
  if (y < opts.minClarity || x <= 0) return { frequency: null, clarity: Math.max(0, y), rms: level }

  const frequency = sampleRate / x
  if (frequency < opts.minFrequency || frequency > opts.maxFrequency) {
    return { frequency: null, clarity: y, rms: level }
  }
  return { frequency, clarity: y, rms: level }
}

/**
 * Median-of-N smoother. A median rejects the single-frame octave jumps that a
 * moving average would only blur into the reading.
 */
export class PitchSmoother {
  private readonly history: number[] = []

  constructor(private readonly size = 5) {}

  push(frequency: number | null): number | null {
    if (frequency === null) {
      this.history.length = 0
      return null
    }
    this.history.push(frequency)
    if (this.history.length > this.size) this.history.shift()
    const sorted = [...this.history].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }

  reset(): void {
    this.history.length = 0
  }
}

import { describe, expect, it } from 'vitest'
import { PitchSmoother, detectPitch, rms } from '../src/core/pitch'
import { midiToFreq, nameToMidi } from '../src/core/music'

const SAMPLE_RATE = 44100
const SIZE = 2048

/** A tone with a few harmonics, which is what a voice or a trombone actually is. */
function tone(freq: number, harmonics = [1, 0.5, 0.3, 0.15], amplitude = 0.4): Float32Array {
  const buf = new Float32Array(SIZE)
  for (let i = 0; i < SIZE; i++) {
    let v = 0
    harmonics.forEach((amp, h) => {
      v += amp * Math.sin((2 * Math.PI * freq * (h + 1) * i) / SAMPLE_RATE)
    })
    buf[i] = (amplitude * v) / harmonics.reduce((a, b) => a + b, 0)
  }
  return buf
}

function noise(amplitude: number): Float32Array {
  const buf = new Float32Array(SIZE)
  for (let i = 0; i < SIZE; i++) buf[i] = (Math.random() * 2 - 1) * amplitude
  return buf
}

describe('detectPitch', () => {
  it('finds the fundamental of a synthetic tone within a few cents', () => {
    for (const name of ['E2', 'C3', 'A3', 'C4', 'A4', 'A#4', 'C5']) {
      const freq = midiToFreq(nameToMidi(name))
      const result = detectPitch(tone(freq), SAMPLE_RATE)
      expect(result.frequency, `${name} was not detected`).not.toBeNull()
      const cents = 1200 * Math.log2(result.frequency! / freq)
      expect(Math.abs(cents), `${name} off by ${cents.toFixed(1)} cents`).toBeLessThan(10)
    }
  })

  it('does not fall an octave on a harmonic-rich tone', () => {
    // A missing-fundamental-ish stack is the classic octave-error trap.
    const freq = midiToFreq(nameToMidi('G2'))
    const result = detectPitch(tone(freq, [0.2, 1, 0.8, 0.6, 0.4]), SAMPLE_RATE)
    expect(result.frequency).not.toBeNull()
    const cents = Math.abs(1200 * Math.log2(result.frequency! / freq))
    expect(cents).toBeLessThan(60)
  })

  it('reports silence as no pitch', () => {
    expect(detectPitch(new Float32Array(SIZE), SAMPLE_RATE).frequency).toBeNull()
  })

  it('rejects noise instead of inventing a note', () => {
    const result = detectPitch(noise(0.3), SAMPLE_RATE)
    expect(result.frequency).toBeNull()
  })

  it('measures level', () => {
    expect(rms(new Float32Array(SIZE))).toBe(0)
    expect(rms(tone(440))).toBeGreaterThan(0.05)
  })
})

describe('PitchSmoother', () => {
  it('takes the median so one octave jump is ignored', () => {
    const s = new PitchSmoother(5)
    ;[440, 441, 439, 880, 440].forEach((f) => s.push(f))
    expect(s.push(440)).toBeCloseTo(440, 0)
  })

  it('clears history on a dropout', () => {
    const s = new PitchSmoother(5)
    s.push(440)
    s.push(440)
    expect(s.push(null)).toBeNull()
    expect(s.push(220)).toBe(220)
  })
})

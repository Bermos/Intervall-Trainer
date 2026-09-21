/**
 * Web Audio wrapper: one AudioContext shared between the reference tones and
 * the microphone analyser, created lazily because browsers only allow it after
 * a user gesture.
 */

export type Timbre = 'sine' | 'triangle' | 'brass'

/** 2048 samples at 44.1 kHz is ~46 ms: enough periods for a low E2, still snappy. */
export const FRAME_SIZE = 2048

export class AudioEngine {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private buffer = new Float32Array(FRAME_SIZE)

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100
  }

  get micActive(): boolean {
    return this.analyser !== null
  }

  /** Must be called from a user gesture on iOS/Safari. */
  async resume(): Promise<AudioContext> {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      this.ctx = new Ctor()
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    return this.ctx
  }

  async startMic(): Promise<void> {
    if (this.analyser) return
    const ctx = await this.resume()
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // All three would fight the pitch detector: AGC pumps the level,
        // noise suppression eats sustained tones, echo cancellation filters.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    })
    this.source = ctx.createMediaStreamSource(this.stream)
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = FRAME_SIZE
    this.analyser.smoothingTimeConstant = 0
    this.source.connect(this.analyser)
  }

  stopMic(): void {
    this.source?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.source = null
    this.stream = null
    this.analyser = null
  }

  /** Latest frame of mic samples, or null when the mic is not running. */
  readFrame(): Float32Array | null {
    if (!this.analyser) return null
    this.analyser.getFloatTimeDomainData(this.buffer)
    return this.buffer
  }

  /** Plays a note. Returns once the tone has been scheduled, not when it ends. */
  async playTone(frequency: number, durationMs = 900, timbre: Timbre = 'triangle'): Promise<void> {
    const ctx = await this.resume()
    const now = ctx.currentTime
    const duration = durationMs / 1000
    const gain = ctx.createGain()
    gain.connect(ctx.destination)

    // Soft attack and release: a hard gate clicks, and a click is the one thing
    // guaranteed to confuse a pitch detector listening through the speakers.
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02)
    gain.gain.setValueAtTime(0.25, now + duration - 0.08)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    const oscillators: OscillatorNode[] = []
    if (timbre === 'brass') {
      // A cheap brass-ish stack: fundamental plus decaying odd/even partials.
      const partials: Array<[number, number]> = [
        [1, 1],
        [2, 0.5],
        [3, 0.32],
        [4, 0.18],
        [5, 0.1],
      ]
      for (const [ratio, amp] of partials) {
        const osc = ctx.createOscillator()
        const partialGain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(frequency * ratio, now)
        partialGain.gain.setValueAtTime(amp, now)
        osc.connect(partialGain)
        partialGain.connect(gain)
        oscillators.push(osc)
      }
    } else {
      const osc = ctx.createOscillator()
      osc.type = timbre
      osc.frequency.setValueAtTime(frequency, now)
      osc.connect(gain)
      oscillators.push(osc)
    }

    for (const osc of oscillators) {
      osc.start(now)
      osc.stop(now + duration + 0.05)
    }
    const last = oscillators[oscillators.length - 1]
    last.onended = () => gain.disconnect()
  }

  /** Short two-tone confirmation, used when a prompt is solved. */
  async playSuccess(): Promise<void> {
    await this.playTone(880, 110, 'sine')
    window.setTimeout(() => void this.playTone(1320, 160, 'sine'), 110)
  }

  close(): void {
    this.stopMic()
    void this.ctx?.close()
    this.ctx = null
  }
}

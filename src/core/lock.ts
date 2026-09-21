import { centsBetween } from './music'

export type LockState = 'idle' | 'searching' | 'close' | 'locking' | 'locked'

export interface LockConfig {
  /** Deviation in cents that counts as correct. */
  toleranceCents: number
  /** How long the pitch must stay inside tolerance before we move on. */
  holdMs: number
  /**
   * Grace period for a dropout (a breath, a slide change, one bad frame).
   * Within it the hold freezes instead of resetting; beyond it we start over.
   */
  graceMs: number
}

export const DEFAULT_LOCK: LockConfig = {
  toleranceCents: 25,
  holdMs: 1200,
  graceMs: 250,
}

export interface LockUpdate {
  state: LockState
  /** 0..1 progress of the hold timer. */
  progress: number
  /** Deviation from the target in cents, or null when no pitch was heard. */
  cents: number | null
  /** True only on the frame the hold completes. */
  justLocked: boolean
}

/**
 * Tracks "has the player held the target note long enough". `now` is injected
 * so a whole take can be stepped through deterministically in tests.
 */
export class LockTracker {
  private heldMs = 0
  private lastGoodAt: number | null = null
  /** Whether the previous frame was inside tolerance, so we know if time is creditable. */
  private lastFrameGood = false
  private locked = false

  constructor(private config: LockConfig = DEFAULT_LOCK) {}

  configure(config: LockConfig): void {
    this.config = config
    this.reset()
  }

  reset(): void {
    this.heldMs = 0
    this.lastGoodAt = null
    this.lastFrameGood = false
    this.locked = false
  }

  get progress(): number {
    return Math.min(1, this.heldMs / this.config.holdMs)
  }

  update(frequency: number | null, targetFreq: number, now: number): LockUpdate {
    if (this.locked) return { state: 'locked', progress: 1, cents: null, justLocked: false }

    const cents = frequency === null ? null : centsBetween(frequency, targetFreq)
    const good = cents !== null && Math.abs(cents) <= this.config.toleranceCents

    if (!good) {
      const inGrace = this.lastGoodAt !== null && now - this.lastGoodAt <= this.config.graceMs
      if (inGrace) {
        this.lastFrameGood = false
        return { state: 'locking', progress: this.progress, cents, justLocked: false }
      }
      this.heldMs = 0
      this.lastGoodAt = null
      this.lastFrameGood = false
      const near = cents !== null && Math.abs(cents) <= this.config.toleranceCents * 2
      return { state: near ? 'close' : 'searching', progress: 0, cents, justLocked: false }
    }

    if (this.lastGoodAt === null || now - this.lastGoodAt > this.config.graceMs) {
      // Nothing to resume from: start the hold over.
      this.heldMs = 0
    } else if (this.lastFrameGood) {
      // Only the span between two *consecutive good* frames is creditable, so a
      // gap inside the grace window freezes the bar instead of filling it.
      this.heldMs += now - this.lastGoodAt
    }
    this.lastGoodAt = now
    this.lastFrameGood = true

    if (this.heldMs >= this.config.holdMs) {
      this.locked = true
      return { state: 'locked', progress: 1, cents, justLocked: true }
    }
    return { state: 'locking', progress: this.progress, cents, justLocked: false }
  }
}

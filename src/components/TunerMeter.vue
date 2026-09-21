<script setup lang="ts">
import { computed } from 'vue'
import type { LockState } from '../core/lock'

const props = defineProps<{
  cents: number | null
  toleranceCents: number
  progress: number
  state: LockState
  /** Input level 0..~0.5, shown so a silent mic is obvious. */
  level: number
}>()

/** Cents shown at the far left/right of the meter. */
const SPAN = 50

const needlePercent = computed(() => {
  if (props.cents === null) return 50
  const clamped = Math.max(-SPAN, Math.min(SPAN, props.cents))
  return ((clamped + SPAN) / (2 * SPAN)) * 100
})

const tolerancePercent = computed(() =>
  Math.min(100, (Math.min(props.toleranceCents, SPAN) / SPAN) * 100),
)

const color = computed(() => {
  if (props.state === 'locked') return 'var(--good)'
  if (props.cents === null) return 'var(--muted)'
  const abs = Math.abs(props.cents)
  if (abs <= props.toleranceCents) return 'var(--good)'
  if (abs <= props.toleranceCents * 2) return 'var(--warn)'
  return 'var(--bad)'
})

/** Beyond this the exact number stops being useful, so it is shown as an overflow. */
const LABEL_LIMIT = 99

const centsLabel = computed(() => {
  if (props.cents === null) return '–'
  const rounded = Math.round(props.cents)
  if (rounded > LABEL_LIMIT) return `>+${LABEL_LIMIT}`
  if (rounded < -LABEL_LIMIT) return `<-${LABEL_LIMIT}`
  return `${rounded > 0 ? '+' : ''}${rounded}`
})

const hint = computed(() => {
  if (props.state === 'locked') return 'Locked'
  if (props.cents === null) return 'Listening…'
  const abs = Math.abs(props.cents)
  const low = props.cents < 0
  if (abs <= props.toleranceCents) return 'Hold it'
  if (abs <= props.toleranceCents * 2) return low ? 'A touch low' : 'A touch high'
  // Past a semitone it is a wrong note, not an intonation problem.
  if (abs >= 100) return low ? 'Well below the note' : 'Well above the note'
  return low ? 'Too low' : 'Too high'
})

const levelPercent = computed(() => Math.min(100, (props.level / 0.25) * 100))
</script>

<template>
  <div class="meter" :class="`state-${state}`">
    <div class="readout">
      <span class="cents mono" :style="{ color }">{{ centsLabel }}</span>
      <span class="unit muted">cents</span>
    </div>

    <div class="scale" role="img" :aria-label="`${centsLabel} cents from target`">
      <div class="tolerance" :style="{ width: `${tolerancePercent}%` }" />
      <div class="center-line" />
      <div
        v-if="cents !== null"
        class="needle"
        :style="{ left: `${needlePercent}%`, background: color }"
      />
      <span class="tick left muted">-{{ SPAN }}</span>
      <span class="tick right muted">+{{ SPAN }}</span>
    </div>

    <div class="hold">
      <div class="hold-fill" :style="{ width: `${progress * 100}%`, background: color }" />
    </div>

    <div class="footer">
      <span class="muted">{{ hint }}</span>
      <span class="input-level" :title="`Input level ${Math.round(levelPercent)}%`">
        <i :style="{ width: `${levelPercent}%` }" />
      </span>
    </div>
  </div>
</template>

<style scoped>
.meter {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.readout {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 8px;
}

.cents {
  font-size: 2.6rem;
  font-weight: 600;
  line-height: 1;
  transition: color 0.12s ease;
}

.unit {
  font-size: 0.9rem;
}

.scale {
  position: relative;
  height: 46px;
  border-radius: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  overflow: hidden;
}

.tolerance {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(47, 210, 122, 0.16);
}

.center-line {
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  background: var(--muted);
  opacity: 0.6;
}

.needle {
  position: absolute;
  top: 3px;
  bottom: 3px;
  width: 4px;
  margin-left: -2px;
  border-radius: 2px;
  transition: left 0.08s linear, background 0.12s ease;
}

.tick {
  position: absolute;
  bottom: 3px;
  font-size: 0.7rem;
}

.tick.left {
  left: 6px;
}

.tick.right {
  right: 6px;
}

.hold {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  overflow: hidden;
}

.hold-fill {
  height: 100%;
  transition: width 0.08s linear;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  gap: 12px;
}

.input-level {
  display: block;
  width: 72px;
  height: 5px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.input-level i {
  display: block;
  height: 100%;
  background: var(--muted);
  transition: width 0.1s linear;
}
</style>

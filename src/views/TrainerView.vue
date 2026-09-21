<script setup lang="ts">
import { computed } from 'vue'
import TunerMeter from '../components/TunerMeter.vue'
import type { useTrainer } from '../composables/useTrainer'

const props = defineProps<{ trainer: ReturnType<typeof useTrainer> }>()
const t = props.trainer

const ex = computed(() => t.exercise.value)
const running = computed(() => t.phase.value !== 'idle' && t.phase.value !== 'error')

const stepLabel = computed(() => {
  if (!ex.value) return ''
  if (t.stage.value === 'root') return 'Step 1 — the root'
  return 'Step 2 — the interval'
})

const instruction = computed(() => {
  if (!ex.value) return ''
  if (t.stage.value === 'root') return `Sing or play ${t.noteName(ex.value.rootMidi)}`
  const dir = ex.value.direction === 'up' ? 'up' : 'down'
  return `${ex.value.interval.name} ${dir}`
})

const bigNote = computed(() => {
  if (!ex.value) return '—'
  if (t.stage.value === 'root') return t.noteName(ex.value.rootMidi)
  return t.showTarget.value ? t.noteName(ex.value.targetMidi) : '?'
})

const detectedNote = computed(() => {
  const f = t.live.frequency
  if (f === null) return null
  // Nearest note to whatever is actually coming out of the mic, which makes a
  // wrong-octave attempt obvious at a glance.
  const midi = Math.round(69 + 12 * Math.log2(f / t.settings.a4))
  return t.noteName(midi)
})
</script>

<template>
  <section>
    <div v-if="t.phase.value === 'error'" class="card error">
      <p>{{ t.errorMessage.value }}</p>
      <button class="primary" @click="t.start()">Try again</button>
    </div>

    <div v-else-if="!running" class="card start">
      <h2>Ready to practise?</h2>
      <p class="muted">
        You will hear a root note, sing or play it back until it turns green, then find the
        interval from it. Everything stays on this device.
      </p>
      <button class="primary big" @click="t.start()">Start · allow microphone</button>
      <p v-if="t.settingsImpossible.value" class="warn-text">
        Heads up: no interval currently fits your range. Check the settings tab first.
      </p>
    </div>

    <template v-else>
      <div class="card prompt" :class="{ solved: t.phase.value === 'solved' }">
        <div class="row between">
          <span class="step">{{ stepLabel }}</span>
          <span class="muted mono" v-if="ex">
            {{ t.noteName(ex.rootMidi) }} → {{ t.showTarget.value ? t.noteName(ex.targetMidi) : '?' }}
          </span>
        </div>

        <p class="instruction">{{ instruction }}</p>
        <p class="big-note mono">{{ bigNote }}</p>

        <div class="steps" aria-hidden="true">
          <span class="dot" :class="{ done: t.stage.value === 'target', active: t.stage.value === 'root' }" />
          <span class="bar" />
          <span class="dot" :class="{ active: t.stage.value === 'target' }" />
        </div>

        <div
          v-if="t.timeoutRemaining.value !== null"
          class="timeout"
          :title="'Time left on this interval before returning to the root'"
        >
          <i :style="{ width: `${t.timeoutRemaining.value * 100}%` }" />
        </div>

        <p v-if="t.bouncedBack.value" class="bounce" role="status">
          Time is up — back to the root, let's set it up again.
        </p>
      </div>

      <div class="card">
        <TunerMeter
          :cents="t.live.cents"
          :tolerance-cents="t.settings.toleranceCents"
          :progress="t.live.progress"
          :state="t.live.lockState"
          :level="t.live.level"
        />
        <p class="detected muted mono">
          {{ detectedNote ? `Hearing ${detectedNote}` : 'No pitch detected' }}
        </p>
      </div>

      <div class="row controls">
        <button @click="t.replayRoot()">Replay root</button>
        <button @click="t.playTargetNote()">Play the answer</button>
        <button class="ghost" @click="t.skip()">Skip</button>
        <button class="ghost" @click="t.stop()">Stop</button>
      </div>

      <p class="muted misses" v-if="t.misses.value > 0">
        Retries on this interval: {{ t.misses.value }}
      </p>
    </template>
  </section>
</template>

<style scoped>
.card + .card,
.card + .row {
  margin-top: 14px;
}

.start {
  text-align: center;
}

.start p {
  margin: 12px 0 20px;
  line-height: 1.5;
}

.big {
  font-size: 1.05rem;
  padding: 14px 22px;
}

.error {
  border-color: var(--bad);
}

.warn-text {
  color: var(--warn);
  font-size: 0.9rem;
}

.prompt {
  text-align: center;
  transition: border-color 0.2s ease;
}

.prompt.solved {
  border-color: var(--good);
}

.row.between {
  justify-content: space-between;
  font-size: 0.85rem;
}

.step {
  color: var(--accent);
  font-weight: 600;
  font-size: 0.85rem;
  letter-spacing: 0.02em;
}

.instruction {
  margin: 18px 0 4px;
  font-size: 1.15rem;
}

.big-note {
  margin: 0;
  font-size: 3.4rem;
  font-weight: 600;
  line-height: 1.1;
}

.steps {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 16px 0 4px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--border);
}

.dot.active {
  background: var(--accent);
}

.dot.done {
  background: var(--good);
}

.bar {
  width: 40px;
  height: 2px;
  background: var(--border);
}

.timeout {
  margin-top: 12px;
  height: 4px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.timeout i {
  display: block;
  height: 100%;
  background: var(--warn);
  transition: width 0.1s linear;
}

.bounce {
  margin: 10px 0 0;
  color: var(--warn);
  font-size: 0.9rem;
}

.detected {
  text-align: center;
  margin: 14px 0 0;
  font-size: 0.85rem;
}

.controls {
  justify-content: center;
}

.misses {
  text-align: center;
  font-size: 0.85rem;
  margin-top: 12px;
}
</style>

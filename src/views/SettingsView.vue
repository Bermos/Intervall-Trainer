<script setup lang="ts">
import { computed } from 'vue'
import { INTERVALS, RANGE_PRESETS, midiToName, nameToMidi } from '../core/music'
import { CUSTOM_RANGE_ID } from '../core/settings'
import type { useTrainer } from '../composables/useTrainer'

const props = defineProps<{ trainer: ReturnType<typeof useTrainer> }>()
const s = props.trainer.settings
const t = props.trainer

const voices = computed(() => RANGE_PRESETS.filter((p) => p.group === 'Voice'))
const instruments = computed(() => RANGE_PRESETS.filter((p) => p.group === 'Instrument'))
const activePreset = computed(() => RANGE_PRESETS.find((p) => p.id === s.rangePresetId) ?? null)

const rangeLabel = computed(() => `${midiToName(t.range.value.low)} – ${midiToName(t.range.value.high)}`)

const MIN_MIDI = nameToMidi('C1')
const MAX_MIDI = nameToMidi('C7')

function toggleInterval(semitones: number): void {
  const idx = s.semitones.indexOf(semitones)
  if (idx >= 0) {
    // Never let the last one go: an empty selection has no valid prompts.
    if (s.semitones.length === 1) return
    s.semitones.splice(idx, 1)
  } else {
    s.semitones.push(semitones)
    s.semitones.sort((a, b) => a - b)
  }
}

function toggleDirection(dir: 'up' | 'down'): void {
  const idx = s.directions.indexOf(dir)
  if (idx >= 0) {
    if (s.directions.length === 1) return
    s.directions.splice(idx, 1)
  } else {
    s.directions.push(dir)
  }
}

function onCustomLow(value: number): void {
  s.customLow = Math.min(value, s.customHigh)
  s.rangePresetId = CUSTOM_RANGE_ID
}

function onCustomHigh(value: number): void {
  s.customHigh = Math.max(value, s.customLow)
  s.rangePresetId = CUSTOM_RANGE_ID
}

/** Switching to custom seeds it from whatever preset was showing. */
function selectPreset(id: string): void {
  if (id === CUSTOM_RANGE_ID) {
    s.customLow = t.range.value.low
    s.customHigh = t.range.value.high
  }
  s.rangePresetId = id
}
</script>

<template>
  <section>
    <div class="card">
      <h3>Range</h3>
      <p class="muted hint">Prompts only use notes inside this range — both the root and the interval.</p>

      <div class="field">
        <span>Voice</span>
        <div class="row">
          <button
            v-for="preset in voices"
            :key="preset.id"
            class="chip"
            :aria-pressed="s.rangePresetId === preset.id"
            @click="selectPreset(preset.id)"
          >
            {{ preset.label }}
          </button>
        </div>
      </div>

      <div class="field">
        <span>Instrument</span>
        <div class="row">
          <button
            v-for="preset in instruments"
            :key="preset.id"
            class="chip"
            :aria-pressed="s.rangePresetId === preset.id"
            :title="preset.hint"
            @click="selectPreset(preset.id)"
          >
            {{ preset.label }}
          </button>
          <button
            class="chip"
            :aria-pressed="s.rangePresetId === CUSTOM_RANGE_ID"
            @click="selectPreset(CUSTOM_RANGE_ID)"
          >
            Custom
          </button>
        </div>
      </div>

      <p class="range-readout mono">
        {{ rangeLabel }}
        <span class="muted" v-if="activePreset?.hint"> · {{ activePreset.hint }}</span>
      </p>

      <template v-if="s.rangePresetId === CUSTOM_RANGE_ID">
        <label class="field">
          <span>Lowest note — {{ midiToName(s.customLow) }}</span>
          <input
            type="range"
            :min="MIN_MIDI"
            :max="MAX_MIDI"
            :value="s.customLow"
            @input="onCustomLow(Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <label class="field">
          <span>Highest note — {{ midiToName(s.customHigh) }}</span>
          <input
            type="range"
            :min="MIN_MIDI"
            :max="MAX_MIDI"
            :value="s.customHigh"
            @input="onCustomHigh(Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </template>

      <p v-if="t.settingsImpossible.value" class="warn-text">
        No interval fits this range right now. Widen it or enable a smaller interval.
      </p>
    </div>

    <div class="card">
      <h3>Intervals</h3>
      <div class="row">
        <button
          v-for="interval in INTERVALS"
          :key="interval.semitones"
          class="chip"
          :aria-pressed="s.semitones.includes(interval.semitones)"
          :title="interval.name"
          @click="toggleInterval(interval.semitones)"
        >
          {{ interval.short }}
        </button>
      </div>

      <div class="field spaced">
        <span>Direction</span>
        <div class="row">
          <button class="chip" :aria-pressed="s.directions.includes('up')" @click="toggleDirection('up')">
            Up
          </button>
          <button
            class="chip"
            :aria-pressed="s.directions.includes('down')"
            @click="toggleDirection('down')"
          >
            Down
          </button>
        </div>
      </div>
    </div>

    <div class="card">
      <h3>Difficulty</h3>

      <label class="field">
        <span>Tolerance — ±{{ s.toleranceCents }} cents</span>
        <input type="range" min="5" max="60" step="1" v-model.number="s.toleranceCents" />
      </label>

      <label class="field">
        <span>Hold time — {{ (s.holdMs / 1000).toFixed(1 ) }} s inside tolerance</span>
        <input type="range" min="300" max="3000" step="100" v-model.number="s.holdMs" />
      </label>

      <label class="field">
        <span>
          Interval time limit —
          {{ s.targetTimeoutMs === 0 ? 'off' : `${(s.targetTimeoutMs / 1000).toFixed(0)} s` }}
        </span>
        <input type="range" min="0" max="60000" step="1000" v-model.number="s.targetTimeoutMs" />
        <small class="muted">
          When the time runs out you go back to the root of the same interval and try again.
        </small>
      </label>

      <label class="check">
        <input type="checkbox" v-model="s.requireRoot" />
        <span>
          Sing the root first
          <small class="muted">Off turns this into a plain "hit that note" drill.</small>
        </span>
      </label>

      <label class="check">
        <input type="checkbox" v-model="s.earTrainingMode" />
        <span>
          Ear training mode
          <small class="muted">Hides the name of the interval note until you solve it.</small>
        </span>
      </label>
    </div>

    <div class="card">
      <h3>Sound</h3>

      <label class="check">
        <input type="checkbox" v-model="s.playRoot" />
        <span>Play the root note at the start of each prompt</span>
      </label>

      <label class="check">
        <input type="checkbox" v-model="s.playTarget" />
        <span>
          Also play the interval note
          <small class="muted">Trains intonation rather than your ear.</small>
        </span>
      </label>

      <label class="field spaced">
        <span>Reference timbre</span>
        <select v-model="s.tone">
          <option value="sine">Sine</option>
          <option value="triangle">Triangle</option>
          <option value="brass">Brass</option>
        </select>
      </label>

      <label class="field">
        <span>Concert pitch — A4 = {{ s.a4 }} Hz</span>
        <input type="range" min="415" max="450" step="1" v-model.number="s.a4" />
      </label>
    </div>
  </section>
</template>

<style scoped>
.card + .card {
  margin-top: 14px;
}

h3 {
  margin-bottom: 4px;
  font-size: 1rem;
}

.hint {
  font-size: 0.85rem;
  margin: 0 0 16px;
}

.field.spaced {
  margin-top: 16px;
  margin-bottom: 0;
}

.field small {
  font-size: 0.78rem;
}

.range-readout {
  margin: 4px 0 16px;
  font-size: 1.05rem;
}

.warn-text {
  color: var(--warn);
  font-size: 0.88rem;
  margin: 0;
}

.check {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 0;
  cursor: pointer;
}

.check input {
  margin-top: 3px;
  accent-color: var(--accent);
  width: 17px;
  height: 17px;
}

.check small {
  display: block;
  font-size: 0.78rem;
  margin-top: 2px;
}
</style>

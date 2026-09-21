<script setup lang="ts">
import { computed, ref } from 'vue'
import { intervalBySemitones } from '../core/music'
import {
  averageAbsCents,
  averageLockMs,
  averageMisses,
  practiceStreak,
  successRate,
} from '../core/stats'
import type { useTrainer } from '../composables/useTrainer'

const props = defineProps<{ trainer: ReturnType<typeof useTrainer> }>()
const t = props.trainer
const confirmingClear = ref(false)

const stats = computed(() => t.stats.value)

const rows = computed(() =>
  Object.values(stats.value.byInterval)
    .sort((a, b) => a.semitones - b.semitones)
    .map((stat) => ({
      stat,
      interval: intervalBySemitones(stat.semitones),
      rate: successRate(stat),
      lockMs: averageLockMs(stat),
      cents: averageAbsCents(stat),
      misses: averageMisses(stat),
    })),
)

/** Last 14 days, oldest first, so the bar chart reads left to right. */
const recentDays = computed(() => {
  const out: Array<{ day: string; attempts: number; successes: number; label: string }> = []
  const cursor = new Date()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(cursor)
    d.setDate(d.getDate() - i)
    const pad = (n: number) => String(n).padStart(2, '0')
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const entry = stats.value.byDay[key]
    out.push({
      day: key,
      attempts: entry?.attempts ?? 0,
      successes: entry?.successes ?? 0,
      label: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    })
  }
  return out
})

const maxDay = computed(() => Math.max(1, ...recentDays.value.map((d) => d.attempts)))
const overallRate = computed(() => successRate(stats.value))
const days = computed(() => practiceStreak(stats.value))

const weakest = computed(() => {
  const candidates = rows.value.filter((r) => r.stat.attempts >= 3)
  if (candidates.length === 0) return null
  const worst = [...candidates].sort((a, b) => a.rate - b.rate)[0]
  // Calling something "weakest" when everything is solved first try is noise.
  return worst.rate < 1 ? worst : null
})

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function seconds(ms: number | null): string {
  return ms === null ? '—' : `${(ms / 1000).toFixed(1)} s`
}

function clear(): void {
  t.clearStats()
  confirmingClear.value = false
}
</script>

<template>
  <section>
    <div class="grid">
      <div class="card tile">
        <span class="muted">Prompts</span>
        <strong class="mono">{{ stats.attempts }}</strong>
      </div>
      <div class="card tile">
        <span class="muted">Solved</span>
        <strong class="mono">{{ percent(overallRate) }}</strong>
      </div>
      <div class="card tile">
        <span class="muted">Best streak</span>
        <strong class="mono">{{ stats.bestStreak }}</strong>
      </div>
      <div class="card tile">
        <span class="muted">Day streak</span>
        <strong class="mono">{{ days }}</strong>
      </div>
    </div>

    <div class="card" v-if="stats.attempts === 0">
      <p class="muted empty">
        Nothing recorded yet. Finish a few prompts and your accuracy per interval shows up here —
        stored only in this browser.
      </p>
    </div>

    <template v-else>
      <div class="card">
        <h3>Last 14 days</h3>
        <div class="chart" role="img" aria-label="Attempts per day over the last two weeks">
          <div
            v-for="d in recentDays"
            :key="d.day"
            class="bar-wrap"
            :title="`${d.label}: ${d.successes} of ${d.attempts} solved`"
          >
            <div class="bar-fill" :style="{ height: `${(d.attempts / maxDay) * 100}%` }">
              <div
                class="bar-success"
                :style="{ height: d.attempts ? `${(d.successes / d.attempts) * 100}%` : '0%' }"
              />
            </div>
          </div>
        </div>
        <div class="chart-axis muted">
          <span>{{ recentDays[0].label }}</span>
          <span>Today</span>
        </div>
      </div>

      <div class="card">
        <h3>By interval</h3>
        <p v-if="weakest" class="muted hint">
          Weakest right now: <strong>{{ weakest.interval.name }}</strong> at
          {{ percent(weakest.rate) }}.
        </p>
        <table>
          <thead>
            <tr>
              <th>Interval</th>
              <th title="Prompts seen">Seen</th>
              <th title="Share solved without skipping">Solved</th>
              <th title="Average time to lock the interval note">Time</th>
              <th title="Average absolute deviation while locking">Off</th>
              <th title="Average timeouts per prompt">Retries</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.stat.semitones">
              <td>
                <span class="short mono">{{ row.interval.short }}</span>
                <span class="full">{{ row.interval.name }}</span>
              </td>
              <td class="mono">{{ row.stat.attempts }}</td>
              <td class="mono">{{ percent(row.rate) }}</td>
              <td class="mono">{{ seconds(row.lockMs) }}</td>
              <td class="mono">{{ row.cents === null ? '—' : `${Math.round(row.cents)}¢` }}</td>
              <td class="mono">{{ row.misses === null ? '—' : row.misses.toFixed(1) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div class="card danger">
      <div class="row between">
        <div>
          <strong>Local data</strong>
          <p class="muted small">Stats never leave this device. Clearing cannot be undone.</p>
        </div>
        <button v-if="!confirmingClear" class="ghost" @click="confirmingClear = true">
          Clear stats
        </button>
        <span v-else class="row">
          <button class="ghost" @click="confirmingClear = false">Cancel</button>
          <button class="danger-btn" @click="clear">Delete everything</button>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}

@media (max-width: 520px) {
  .grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.grid .card + .card {
  /* The generic card spacing would push grid items out of their own cells. */
  margin-top: 0;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
}

.tile span {
  font-size: 0.78rem;
}

.tile strong {
  font-size: 1.5rem;
}

.card + .card {
  margin-top: 14px;
}

h3 {
  margin-bottom: 12px;
  font-size: 1rem;
}

.empty {
  margin: 0;
  line-height: 1.5;
}

.chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 110px;
}

.bar-wrap {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: flex-end;
}

.chart-axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  margin-top: 8px;
}

.bar-fill {
  width: 100%;
  min-height: 2px;
  background: var(--surface-2);
  border-radius: 4px 4px 0 0;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}

.bar-success {
  width: 100%;
  background: var(--good);
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
}

th {
  text-align: left;
  font-weight: 500;
  color: var(--muted);
  font-size: 0.78rem;
  padding-bottom: 8px;
}

td {
  padding: 9px 0;
  border-top: 1px solid var(--border);
  white-space: nowrap;
}

th:not(:first-child),
td:not(:first-child) {
  text-align: right;
  padding-left: 10px;
}

.short {
  display: inline-block;
  min-width: 2.4em;
  color: var(--accent);
}

/* On a phone the short code carries the meaning; the full name is a luxury. */
@media (max-width: 460px) {
  .full {
    display: none;
  }
}

.hint {
  margin: -4px 0 12px;
  font-size: 0.85rem;
}

.small {
  font-size: 0.8rem;
  margin: 4px 0 0;
}

.danger-btn {
  border-color: var(--bad);
  color: var(--bad);
  background: transparent;
}

.row.between {
  justify-content: space-between;
  align-items: center;
}
</style>

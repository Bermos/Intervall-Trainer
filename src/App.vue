<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import TrainerView from './views/TrainerView.vue'
import StatsView from './views/StatsView.vue'
import SettingsView from './views/SettingsView.vue'
import { useTrainer } from './composables/useTrainer'

type Tab = 'train' | 'stats' | 'settings'

const trainer = useTrainer()
const tab = ref<Tab>('train')

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'train', label: 'Train' },
  { id: 'stats', label: 'Stats' },
  { id: 'settings', label: 'Settings' },
]

// Leaving the trainer tab mid-session would otherwise keep the mic light on
// while nothing is listening to it.
watch(tab, (next, previous) => {
  if (previous === 'train' && next !== 'train') trainer.stop()
})

onBeforeUnmount(() => trainer.stop())
</script>

<template>
  <header>
    <h1>Intervall-Trainer</h1>
    <nav role="tablist">
      <button
        v-for="item in tabs"
        :key="item.id"
        role="tab"
        class="chip"
        :aria-selected="tab === item.id"
        :aria-pressed="tab === item.id"
        @click="tab = item.id"
      >
        {{ item.label }}
      </button>
    </nav>
  </header>

  <main>
    <TrainerView v-show="tab === 'train'" :trainer="trainer" />
    <StatsView v-if="tab === 'stats'" :trainer="trainer" />
    <SettingsView v-if="tab === 'settings'" :trainer="trainer" />
  </main>
</template>

<style scoped>
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}

h1 {
  font-size: 1.15rem;
}

nav {
  display: flex;
  gap: 6px;
}
</style>

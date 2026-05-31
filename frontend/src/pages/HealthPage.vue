<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { getHealthStatus } from '../lib/disguiseApi'

const machines = ref([])
const isLoading = ref(false)
const lastError = ref('')

const severityRank = {
  ready: 0,
  offline: 1,
  warning: 2,
  error: 3,
}

const HEALTH_STATE_ORDER = [
  'Live Update',
  'Project Sync',
  'Transport Control',
  'Dmx',
  'Osc',
  'Framelock',
  'Settings',
  'GUI',
  'Genlock',
]

function stateSeverity(state) {
  return String(state?.severity || 'ready').toLowerCase()
}

function machineSeverity(machine) {
  return (machine.status?.states ?? []).reduce((highest, state) => {
    const severity = stateSeverity(state)
    return (severityRank[severity] ?? 0) > (severityRank[highest] ?? 0) ? severity : highest
  }, 'ready')
}

function orderedStates(machine) {
  const states = machine.status?.states ?? []
  return HEALTH_STATE_ORDER.map((name) =>
    states.find((state) => state.name === name) ?? {
      name,
      detail: '',
      severity: 'missing',
      missing: true,
    },
  )
}

async function refreshHealth() {
  isLoading.value = true
  lastError.value = ''

  try {
    const data = await getHealthStatus()
    machines.value = Array.isArray(data.result) ? data.result : []
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : 'Failed to load health'
  } finally {
    isLoading.value = false
  }
}

let healthTimer = null

onMounted(() => {
  refreshHealth()
  healthTimer = window.setInterval(refreshHealth, 5000)
})

onUnmounted(() => {
  if (healthTimer) {
    window.clearInterval(healthTimer)
  }
})
</script>

<template>
  <main class="control-workspace health-workspace" aria-label="Health view">
    <section class="health-list" aria-label="Machine health">
      <article
        v-for="machine in machines"
        :key="machine.machine?.uid || machine.machine?.hostname"
        class="health-row"
        :class="`severity-${machineSeverity(machine).toLowerCase()}`"
      >
        <div class="health-machine">
          <strong>{{ machine.machine?.name || machine.machine?.hostname }}</strong>
        </div>

        <div class="health-states">
          <div
            v-for="state in orderedStates(machine)"
            :key="`${state.category}-${state.name}-${state.detail}`"
            class="health-state"
            :class="`severity-${stateSeverity(state)}`"
          >
            <strong>{{ state.name }}</strong>
            <em>{{ state.detail || 'Not reported' }}</em>
          </div>
        </div>
      </article>

      <p v-if="!isLoading && machines.length === 0" class="empty-state">No health data.</p>
      <p v-if="lastError && machines.length === 0" class="empty-state">{{ lastError }}</p>
    </section>
  </main>
</template>

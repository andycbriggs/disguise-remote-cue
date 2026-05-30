<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { getAppSettings, saveAppSettings } from '../lib/appSettingsApi'

const disguiseHost = ref('')
const disguisePort = ref(80)
const appHost = ref('0.0.0.0')
const runOnStartup = ref(false)
const interfaceOptions = ref([])
const requiresRestart = ref(false)
const isLoading = ref(false)
const isSaving = ref(false)
const lastError = ref('')
const savedSnapshot = ref('')
const hasLoaded = ref(false)
let saveTimer = null

const currentSnapshot = computed(() =>
  JSON.stringify({
    disguiseHost: disguiseHost.value,
    disguisePort: Number(disguisePort.value),
    appHost: appHost.value,
    runOnStartup: runOnStartup.value,
  }),
)

const canSave = computed(() => currentSnapshot.value !== savedSnapshot.value && !isSaving.value)

function applySettings(data) {
  const settings = data.settings ?? {}
  disguiseHost.value = settings.disguiseHost ?? ''
  disguisePort.value = settings.disguisePort ?? 80
  appHost.value = settings.appHost ?? '0.0.0.0'
  runOnStartup.value = Boolean(settings.runOnStartup)
  interfaceOptions.value = data.interfaceOptions ?? []
  requiresRestart.value = Boolean(data.requiresRestart)
  savedSnapshot.value = currentSnapshot.value
}

async function reloadSettings() {
  isLoading.value = true
  lastError.value = ''

  try {
    applySettings(await getAppSettings())
    hasLoaded.value = true
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : 'Failed to load settings'
  } finally {
    isLoading.value = false
  }
}

async function saveSettings() {
  if (!canSave.value) return

  isSaving.value = true
  lastError.value = ''

  try {
    applySettings(await saveAppSettings({
      disguiseHost: disguiseHost.value,
      disguisePort: Number(disguisePort.value),
      appHost: appHost.value,
      runOnStartup: runOnStartup.value,
    }))
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : 'Failed to save settings'
  } finally {
    isSaving.value = false
  }
}

function scheduleSave() {
  if (!hasLoaded.value || isLoading.value || !canSave.value) return
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(saveSettings, 350)
}

function selectInterface(address) {
  appHost.value = address
}

watch(currentSnapshot, scheduleSave)

onMounted(reloadSettings)

onUnmounted(() => {
  window.clearTimeout(saveTimer)
})
</script>

<template>
  <main class="control-workspace settings-workspace" aria-label="Settings view">
    <section class="settings-panel" aria-label="App settings">
      <div class="settings-brand" aria-hidden="true">
        <img src="/app-icon-128.png" alt="" />
      </div>

      <div class="settings-stack">
        <label class="transport-select settings-control settings-input-control">
          <input
            v-model="disguiseHost"
            aria-label="Host"
            autocomplete="off"
            spellcheck="false"
            placeholder="192.168.30.101"
          />
          <small>Host</small>
        </label>

        <label class="transport-select settings-control settings-input-control">
          <input
            v-model="disguisePort"
            aria-label="Port"
            type="number"
            min="1"
            max="65535"
            inputmode="numeric"
          />
          <small>Port</small>
        </label>

        <div class="settings-select-list" role="listbox" aria-label="Bind interface">
          <div class="settings-select-list-label">Bind</div>
          <button
            v-for="option in interfaceOptions"
            :key="option.address"
            class="settings-select-option"
            :class="{ active: option.address === appHost }"
            type="button"
            role="option"
            :aria-selected="option.address === appHost"
            @click="selectInterface(option.address)"
          >
            {{ option.label }}
          </button>
        </div>

        <button class="transport-select settings-control settings-toggle-button" type="button" @click="runOnStartup = !runOnStartup">
          <strong class="settings-toggle-state" :class="{ active: runOnStartup }">
            {{ runOnStartup ? 'Enabled' : 'Disabled' }}
          </strong>
          <small>Run on startup</small>
        </button>
      </div>

      <div class="settings-status" aria-live="polite">
        <p v-if="requiresRestart" class="settings-note">Restart the tray app to apply the bind interface change.</p>
        <p v-if="lastError" class="empty-state">{{ lastError }}</p>
        <p v-if="isLoading" class="empty-state">Loading settings.</p>
        <p v-if="isSaving" class="settings-save-state">Saving.</p>
      </div>
    </section>
  </main>
</template>

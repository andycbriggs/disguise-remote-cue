<script setup>
import { inject, ref } from 'vue'
import {
  ChevronDown,
  Link2,
  Power,
} from '@lucide/vue'

const transportMenuOpen = ref(false)

const {
  transports,
  activeTransportId,
  activeTransport,
  visibleCueGroups,
  armedCue,
  selectTransport,
  armCue,
  fireCue,
  toggleEngaged,
} = inject('controlStore')

function selectTransportAndClose(id) {
  selectTransport(id)
  transportMenuOpen.value = false
}
</script>

<template>
  <main class="operator-workspace" aria-label="Cue operator">
    <header class="top-bar">
      <div class="transport-menu-wrap">
        <button class="transport-select" type="button" @click="transportMenuOpen = !transportMenuOpen">
          <span class="transport-select-name">{{ activeTransport.name }}</span>
          <small>Transport</small>
          <ChevronDown />
        </button>

        <div v-if="transportMenuOpen" class="selector-menu transport-menu" role="listbox" aria-label="Select transport">
          <button
            v-for="transport in transports"
            :key="transport.id"
            class="transport-option"
            :class="{ active: transport.id === activeTransportId }"
            type="button"
            role="option"
            :aria-selected="transport.id === activeTransportId"
            @click="selectTransportAndClose(transport.id)"
          >
            <span>
              {{ transport.name }}
            </span>
          </button>
        </div>
      </div>
    </header>

    <section class="cue-status" aria-label="Transport timecode">
      <button
        class="cue-status-power"
        :class="{ disengaged: !activeTransport.engaged }"
        type="button"
        title="Toggle engaged"
        @click="toggleEngaged(activeTransport)"
      >
        <Power />
      </button>
      <span class="cue-status-timecode">
        <Link2 />
        <strong>{{ activeTransport.timecode }}</strong>
      </span>
      <span class="cue-status-label" :class="{ muted: activeTransport.status === 'No Timecode' }">
        {{ activeTransport.status }}
      </span>
    </section>

    <section class="cue-list" aria-label="Cue list">
      <template v-for="group in visibleCueGroups" :key="group.id">
        <div class="cue-track-separator">
          <span>{{ group.label }}</span>
          <small>Track</small>
        </div>

        <button
          v-for="cue in group.cues"
          :key="cue.id"
          class="cue-row"
          :class="{ live: cue.live, armed: cue.id === activeTransport.armedCueId }"
          type="button"
          @click="armCue(cue.id)"
        >
          <span
            v-if="cue.live && cue.remainingLabel"
            class="cue-progress"
            :style="{ width: `${cue.progressPercent}%` }"
          ></span>
          <span class="cue-number">{{ cue.number }}</span>
          <span class="cue-content">
            <strong>{{ cue.name }}</strong>
          </span>
          <span v-if="cue.live && cue.remainingLabel" class="cue-countdown">
            -{{ cue.remainingLabel }}
          </span>
        </button>
      </template>

      <p v-if="visibleCueGroups.every((group) => group.cues.length === 0)" class="empty-state">No cues.</p>
    </section>

    <footer class="go-dock">
      <button class="go-button" type="button" @click="fireCue">
        <span>GO</span>
        <strong>{{ armedCue.name || armedCue.number || '' }}</strong>
      </button>
    </footer>
  </main>
</template>

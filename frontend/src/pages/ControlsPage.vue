<script setup>
import { inject, ref } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Hand,
  Play,
  Power,
  Square,
  StepBack,
  StepForward,
  SunMedium,
  Volume2,
} from '@lucide/vue'

const nudgeMenuOpen = ref(false)

const {
  transports,
  globalOutputMode,
  allTransportsEngaged,
  currentNudgeStep,
  nudgeSteps,
  toggleAllTransportsEngaged,
  toggleEngaged,
  toggleTransportPlaying,
  setTransportStopped,
  nudgeTransportFrame,
  selectNudgeStep,
  setGlobalOutputMode,
  setTransportBrightnessPercent,
  setTransportVolumePercent,
} = inject('controlStore')

function selectNudgeStepAndClose(index) {
  selectNudgeStep(index)
  nudgeMenuOpen.value = false
}
</script>

<template>
  <main class="control-workspace controls-page" aria-label="Control view">
    <header class="top-bar">
      <div class="controls-header-actions">
        <button
          class="engage-button global-engage"
          :class="{ disengaged: !allTransportsEngaged }"
          type="button"
          @click="toggleAllTransportsEngaged"
        >
          <Power />
          Engage All
        </button>
        <div class="icon-segmented" role="group" aria-label="Global output mode">
          <button
            class="icon-button compact output-mode-button"
            :class="{ active: globalOutputMode === 'fadeUp' }"
            type="button"
            title="Fade up"
            @click="setGlobalOutputMode('fadeUp')"
          >
            <ArrowUp />
          </button>
          <button
            class="icon-button compact output-mode-button danger"
            :class="{ active: globalOutputMode === 'fadeDown' }"
            type="button"
            title="Fade down"
            @click="setGlobalOutputMode('fadeDown')"
          >
            <ArrowDown />
          </button>
          <button
            class="icon-button compact output-mode-button danger"
            :class="{ active: globalOutputMode === 'hold' }"
            type="button"
            title="Hold"
            @click="setGlobalOutputMode('hold')"
          >
            <Hand />
          </button>
        </div>
        <div class="step-size-wrap">
          <button
            class="step-size-trigger"
            type="button"
            :title="`Nudge size ${currentNudgeStep.label}`"
            aria-label="Step size"
            @click="nudgeMenuOpen = !nudgeMenuOpen"
          >
            {{ currentNudgeStep.label }}
          </button>

          <div v-if="nudgeMenuOpen" class="selector-menu step-size-menu" role="listbox" aria-label="Nudge size">
            <button
              v-for="(step, index) in nudgeSteps"
              :key="step.label"
              class="transport-option"
              :class="{ active: step.label === currentNudgeStep.label }"
              type="button"
              role="option"
              :aria-selected="step.label === currentNudgeStep.label"
              @click="selectNudgeStepAndClose(index)"
            >
              <span>{{ step.label }}</span>
            </button>
          </div>
        </div>
      </div>
    </header>

    <section class="transport-control-list" aria-label="All transport controls">
      <article
        v-for="transport in transports"
        :key="transport.id"
        class="transport-control-bar"
        :class="{ offline: !transport.online }"
      >
        <div class="transport-control-name">
          <span>
            <strong>{{ transport.name }}</strong>
          </span>
          <div class="transport-row-actions" aria-label="Transport playback">
            <button class="icon-button compact" type="button" :title="`Back ${currentNudgeStep.label}`" @click="nudgeTransportFrame(transport, -1)">
              <StepBack />
            </button>
            <button class="icon-button compact" :class="{ active: transport.playing }" type="button" title="Play" @click="toggleTransportPlaying(transport)">
              <Play />
            </button>
            <button class="icon-button compact" type="button" title="Stop" @click="setTransportStopped(transport)">
              <Square />
            </button>
            <button class="icon-button compact" type="button" :title="`Forward ${currentNudgeStep.label}`" @click="nudgeTransportFrame(transport, 1)">
              <StepForward />
            </button>
            <button class="engage-button" :class="{ disengaged: !transport.engaged }" type="button" @click="toggleEngaged(transport)">
              <Power />
              Engaged
            </button>
          </div>
        </div>

        <div class="transport-bar-controls">
          <label class="mini-slider">
            <span><SunMedium /> {{ transport.brightness }}%</span>
            <input :value="transport.brightness" type="range" min="0" max="100" @change="setTransportBrightnessPercent(transport, $event.target.value)" />
          </label>
          <label class="mini-slider">
            <span><Volume2 /> {{ transport.volume }}%</span>
            <input :value="transport.volume" type="range" min="0" max="100" @change="setTransportVolumePercent(transport, $event.target.value)" />
          </label>
        </div>
      </article>
    </section>
  </main>
</template>

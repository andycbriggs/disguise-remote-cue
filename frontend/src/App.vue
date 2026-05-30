<script setup>
import { computed, provide } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { Activity, ListVideo, NotebookText, SlidersHorizontal } from '@lucide/vue'
import { useDisguiseControl } from './composables/useDisguiseControl'

const route = useRoute()
const showNav = computed(() => route.name !== 'settings')
const controlStore = window.location.pathname === '/settings' ? null : useDisguiseControl()

provide('controlStore', controlStore)
</script>

<template>
  <div class="app-layout">
    <nav v-if="showNav" class="app-nav" aria-label="Primary">
      <RouterLink class="nav-tab" to="/" aria-label="Health" title="Health">
        <Activity />
      </RouterLink>
      <RouterLink class="nav-tab" to="/run" aria-label="Run" title="Run">
        <ListVideo />
      </RouterLink>
      <RouterLink class="nav-tab" to="/controls" aria-label="Controls" title="Controls">
        <SlidersHorizontal />
      </RouterLink>
      <RouterLink class="nav-tab" to="/notes" aria-label="Notes" title="Notes">
        <NotebookText />
      </RouterLink>
    </nav>
    <RouterView />
  </div>
</template>

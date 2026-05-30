import { createRouter, createWebHistory } from 'vue-router'
import RunPage from './pages/RunPage.vue'
import ControlsPage from './pages/ControlsPage.vue'
import HealthPage from './pages/HealthPage.vue'
import NotesPage from './pages/NotesPage.vue'
import SettingsPage from './pages/SettingsPage.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'health', component: HealthPage },
    { path: '/run', name: 'run', component: RunPage },
    { path: '/controls', name: 'controls', component: ControlsPage },
    { path: '/health', redirect: '/' },
    { path: '/notes', name: 'notes', component: NotesPage },
    { path: '/settings', name: 'settings', component: SettingsPage },
  ],
})

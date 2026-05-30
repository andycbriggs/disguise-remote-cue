<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronDown, RefreshCw, Save } from '@lucide/vue'
import { getNotesList, updateNote } from '../lib/disguiseApi'

const NOTES_VIEW_STORAGE_KEY = 'disguise-control:notes-view-state'

function readNotesViewState() {
  try {
    return JSON.parse(window.localStorage.getItem(NOTES_VIEW_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeNotesViewState(state) {
  window.localStorage.setItem(NOTES_VIEW_STORAGE_KEY, JSON.stringify(state))
}

const savedViewState = readNotesViewState()
const notes = ref([])
const activeNoteKey = ref(savedViewState.activeNoteKey ?? '')
const draftText = ref('')
const noteMenuOpen = ref(false)
const isLoading = ref(false)
const isSaving = ref(false)
const lastError = ref('')
const hasLoaded = ref(false)

function noteKey(note) {
  return note.localId || note.note?.uid || note.note?.name || ''
}

function noteLabel(note) {
  return note?.note?.name || 'Untitled note'
}

const noteSelectLabel = computed(() => {
  if (isLoading.value && !hasLoaded.value) return ''
  if (!activeNote.value) return ''
  return noteLabel(activeNote.value)
})

const activeNote = computed(() =>
  notes.value.find((note) => noteKey(note) === activeNoteKey.value) ?? notes.value[0] ?? null,
)

const isDirty = computed(() => {
  if (!activeNote.value) return false

  return draftText.value !== (activeNote.value.text ?? '')
})
const canSave = computed(() => Boolean(activeNote.value && isDirty.value && !isSaving.value))

function selectNote(key) {
  activeNoteKey.value = key
  noteMenuOpen.value = false
}

async function refreshNotes() {
  isLoading.value = true
  lastError.value = ''

  try {
    const data = await getNotesList()
    notes.value = data.result ?? []
    hasLoaded.value = true

    if (!notes.value.some((note) => noteKey(note) === activeNoteKey.value)) {
      activeNoteKey.value = noteKey(notes.value[0] ?? {})
    }
  } catch (error) {
    hasLoaded.value = true
    lastError.value = error instanceof Error ? error.message : 'Failed to load notes'
  } finally {
    isLoading.value = false
  }
}

async function saveNote() {
  if (!canSave.value) return

  isSaving.value = true
  lastError.value = ''

  try {
    const noteLocator = activeNote.value.note?.uid
      ? { uid: activeNote.value.note.uid, name: activeNote.value.note.name }
      : { name: activeNote.value.note.name }
    const payload = {
      note: noteLocator,
      text: draftText.value,
    }
    const data = await updateNote(payload)
    const saved = data.result ?? payload
    const currentKey = activeNoteKey.value
    const index = notes.value.findIndex((note) => noteKey(note) === currentKey)

    if (index >= 0) {
      notes.value.splice(index, 1, saved)
      activeNoteKey.value = noteKey(saved)
    }
  } catch (error) {
    lastError.value = error instanceof Error ? error.message : 'Failed to save note'
  } finally {
    isSaving.value = false
  }
}

watch(
  activeNote,
  (note) => {
    draftText.value = note?.text ?? ''
  },
  { immediate: true },
)

watch(activeNoteKey, () => {
  writeNotesViewState({
    activeNoteKey: activeNoteKey.value,
  })
})

onMounted(refreshNotes)
</script>

<template>
  <main class="control-workspace notes-workspace" aria-label="Notes view">
    <header class="top-bar notes-action-row">
      <div class="note-menu-wrap">
        <button class="transport-select note-select" type="button" @click="noteMenuOpen = !noteMenuOpen">
          <span class="transport-select-name">{{ noteSelectLabel }}</span>
          <small>Note</small>
          <ChevronDown />
        </button>

        <div v-if="noteMenuOpen" class="selector-menu note-menu" role="listbox" aria-label="Select note">
          <button
            v-for="note in notes"
            :key="noteKey(note)"
            class="transport-option"
            :class="{ active: noteKey(note) === activeNoteKey }"
            type="button"
            role="option"
            :aria-selected="noteKey(note) === activeNoteKey"
            @click="selectNote(noteKey(note))"
          >
            <span>{{ noteLabel(note) }}</span>
          </button>
        </div>
      </div>
      <div class="notes-actions">
        <button class="icon-button compact" :class="{ active: canSave }" type="button" title="Save note" :disabled="!canSave" @click="saveNote">
          <Save />
        </button>
        <button class="icon-button compact" type="button" title="Reload notes" @click="refreshNotes">
          <RefreshCw />
        </button>
      </div>
    </header>

    <section class="notes-layout" aria-label="Edit note">
      <section class="note-editor" aria-label="Edit selected note">
        <textarea v-model="draftText" :disabled="!activeNote" spellcheck="false"></textarea>
      </section>

      <p v-if="!isLoading && notes.length === 0" class="empty-state">No notes.</p>
      <p v-if="lastError" class="empty-state">{{ lastError }}</p>
    </section>

  </main>
</template>

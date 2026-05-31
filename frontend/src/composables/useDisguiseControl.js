import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  disengageTransport,
  engageTransport,
  getTransportControlCues,
  getActiveTransportControlTransports,
  goToCueTag,
  goToFrame,
  goToSection,
  goToTime,
  goToTrack,
  playTransport,
  setTransportBrightness,
  setTransportVolume,
  stopTransport,
} from '../lib/disguiseApi'
import { liveUpdate } from '../store/disguiseLiveUpdate'

const EMPTY_TRACK = {
  id: 'no-track',
  uid: 'no-track',
  number: '',
  title: 'No track',
  name: 'No track',
  cues: [],
}

const EMPTY_SETLIST = {
  id: 'no-setlist',
  uid: 'no-setlist',
  name: 'No setlist',
  tracks: [EMPTY_TRACK],
}

const EMPTY_TRANSPORT = {
  id: 'no-transport',
  uid: 'no-transport',
  name: 'No transports',
  online: false,
  engaged: false,
  playing: false,
  brightness: 0,
  volume: 0,
  mode: 'Unknown',
  timecode: '--:--:--:--',
  status: 'No Timecode',
  playheadLocation: 0,
  currentSetlistId: EMPTY_SETLIST.id,
  currentTrackIndex: 0,
  liveCueId: null,
  armedCueId: null,
  setlists: [EMPTY_SETLIST],
}

const FRAME_RATE = 30
const CUE_BOUNDARY_BIAS_SECONDS = 1 / FRAME_RATE
const GO_PLAYMODE = 'PlaySection'
const VIEW_STATE_STORAGE_KEY = 'disguise-control:view-state'
const NUDGE_STEPS = [
  { label: '1f', frames: 1 },
  { label: '1s', frames: FRAME_RATE },
  { label: '5s', frames: FRAME_RATE * 5 },
  { label: '15s', frames: FRAME_RATE * 15 },
  { label: '1m', frames: FRAME_RATE * 60 },
]

const liveTransportExpression = `[
  {
    "uid": str(t.uid),
    "engaged": t.engaged,
    "brightness": t.brightness,
    "volume": t.volume,
    "playmode": str(t.player.playMode),
    "currentTrackUid": str(t.track.uid) if t.track else None,
    "monitorString": t.monitorString,
    "statusString": t.statusString,
    "currentSectionIndex": t.currentSection.index if hasattr(t, "currentSection") and t.currentSection else None
  }
  for t in (object.transportManagers if hasattr(object, "transportManagers") else [object])
]`

const liveTransportRenderExpression = `[
  {
    "uid": str(t.uid),
    "playmode": str(t.player.playMode),
    "currentTrackUid": str(t.track.uid) if t.track else None,
    "monitorString": t.monitorString,
    "statusString": t.statusString,
    "currentSectionIndex": t.currentSection.index if hasattr(t, "currentSection") and t.currentSection else None,
    "playheadLocation": t.player.tRender
  }
  for t in (object.transportManagers if hasattr(object, "transportManagers") else [object])
]`

function normaliseOutputMode(value) {
  if (value === 0) return 'fadeDown'
  if (value === 1) return 'fadeUp'
  if (value === 2) return 'hold'
  if (typeof value !== 'string') return 'unknown'

  const compact = value.replace(/[^a-z]/gi, '').toLowerCase()
  if (compact === 'fadeup') return 'fadeUp'
  if (compact === 'fadedown') return 'fadeDown'
  if (compact === 'hold') return 'hold'
  return 'unknown'
}

function percent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.round(Math.max(0, Math.min(1, value)) * 100)
}

function toApiLevel(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(1, numeric / 100))
}

function compactMode(value) {
  return String(value ?? '').replace(/[^a-z]/gi, '').toLowerCase()
}

function isPlayState(value) {
  const mode = compactMode(value)
  return mode.includes('play') || mode.includes('holdingatsection') || mode.includes('holdsection')
}

function isHoldingAtSection(value) {
  const mode = compactMode(value)
  return mode.includes('holdingatsection') || mode.includes('holdsection')
}

function isAdvancingPlayhead(value) {
  const mode = compactMode(value)
  return mode.includes('play') && !mode.includes('holding')
}

function formatTimecode(seconds, fps = 30) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return '--:--:--:--'
  }

  const totalFrames = Math.floor(seconds * fps)
  const frames = totalFrames % fps
  const totalSeconds = Math.floor(totalFrames / fps)
  const secs = totalSeconds % 60
  const minutes = Math.floor(totalSeconds / 60) % 60
  const hours = Math.floor(totalSeconds / 3600)

  return [hours, minutes, secs, frames].map((part) => String(part).padStart(2, '0')).join(':')
}

function formatDuration(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) {
    return ''
  }

  const totalSeconds = Math.ceil(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = totalSeconds % 60
  const parts = []

  if (hours > 0) {
    parts.push(`${hours}h`)
  }

  if (hours > 0 || minutes > 0) {
    parts.push(`${minutes}m`)
  }

  parts.push(`${secs}s`)
  return parts.join(' ')
}

function normaliseTrack(track, index, cuesByTrackId) {
  const uid = String(track.uid)

  return {
    id: uid,
    uid,
    number: String(index + 1).padStart(2, '0'),
    title: track.name || `Track ${index + 1}`,
    name: track.name || `Track ${index + 1}`,
    length: track.length ?? 0,
    crossfade: track.crossfade ?? 'Unknown',
    cues: cuesByTrackId[uid] ?? [],
  }
}

function normaliseCue(cue, index, trackUid) {
  const tag = cue.tag ?? {}
  const cueTag = cue.cueTag ?? ''
  const tcTag = cue.tcTag ?? ''
  const tagType = tag.type ?? (cueTag ? 'CUE' : tcTag ? 'TC' : null)
  const tagValue = tag.tagText ?? (cueTag || tcTag || '')
  const name = cue.name ?? cue.note ?? ''
  const sectionIndex = cue.section?.index ?? index
  const displayTag = cueTag || tcTag || (tagType && tagValue ? tagValue : '')

  return {
    id: `${trackUid}-${index}-${tagType ?? 'cue'}-${tagValue || cue.position || sectionIndex}`,
    uid: `${trackUid}-${index}`,
    trackUid,
    name,
    number: displayTag,
    tagType,
    tagValue,
    sectionIndex: String(sectionIndex),
    position: cue.position ?? 0,
    current: Boolean(cue.current),
    live: Boolean(cue.current),
    progressPercent: 0,
    remainingLabel: '',
  }
}

function enrichCuesWithPlayback(cues, playheadLocation, isLiveTrack, trackLength, currentSectionIndex, isHolding) {
  if (!isLiveTrack || typeof playheadLocation !== 'number' || !Number.isFinite(playheadLocation)) {
    return cues.map((cue) => ({
      ...cue,
      live: Boolean(cue.current),
      progressPercent: 0,
      remainingLabel: '',
    }))
  }

  const sectionIndex = currentSectionIndex !== null && currentSectionIndex !== undefined
    ? String(currentSectionIndex)
    : null
  const boundarySafePlayhead = Math.max(0, playheadLocation - CUE_BOUNDARY_BIAS_SECONDS)

  return cues.map((cue, index) => {
    const nextCue = cues[index + 1]
    const start = cue.position ?? 0
    const end = nextCue?.position ?? trackLength ?? Infinity
    const duration = end - start
    const timeLive = boundarySafePlayhead >= start && boundarySafePlayhead < end
    const sectionLive = sectionIndex ? cue.sectionIndex === sectionIndex : false
    const live = isHolding && sectionIndex ? sectionLive : timeLive
    const progressPercent = live && !isHolding && Number.isFinite(duration) && duration > 0
      ? Math.max(0, Math.min(100, ((playheadLocation - start) / duration) * 100))
      : 0
    const remainingLabel = live && !isHolding && Number.isFinite(end)
      ? formatDuration(end - playheadLocation)
      : ''

    return {
      ...cue,
      live,
      progressPercent,
      remainingLabel,
    }
  })
}

function toLiveStateMap(value) {
  if (!Array.isArray(value)) return {}

  return Object.fromEntries(
    value
      .filter((transport) => transport?.uid)
      .map((transport) => [String(transport.uid), transport]),
  )
}

function readViewState() {
  try {
    return JSON.parse(window.localStorage.getItem(VIEW_STATE_STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeViewState(state) {
  window.localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(state))
}

export function useDisguiseControl() {
  const { liveTransportState } = liveUpdate.subscribe('d3state:d3.localOrDirectorState().transport', {
    liveTransportState: liveTransportExpression,
  })
  const { liveTransportRenderState } = liveUpdate.subscribe(
    'd3state:d3.localOrDirectorState().transport',
    {
      liveTransportRenderState: liveTransportRenderExpression,
    },
    {
      updateFrequencyMs: 100,
    },
  )
  const { outputMode } = liveUpdate.subscribe('d3state:d3.localOrDirectorState()', {
    outputMode: 'object.output',
  })

  const savedViewState = readViewState()
  const apiTransports = ref([])
  const activeTransportId = ref(savedViewState.activeTransportId ?? '')
  const isLoading = ref(false)
  const lastError = ref('')
  const pendingCommand = ref('')
  const renderClock = ref(Date.now())
  const nudgeStepIndex = ref(Number.isInteger(savedViewState.nudgeStepIndex) ? savedViewState.nudgeStepIndex : 0)
  const armedCueByTransportId = reactive({ ...(savedViewState.armedCueByTransportId ?? {}) })
  const cuesByTrackId = reactive({})
  const loadingCuesByTrackId = reactive({})
  const renderSamplesByTransportId = reactive({})

  const liveStateByTransportId = computed(() => toLiveStateMap(liveTransportState.value))
  const liveRenderByTransportId = computed(() => toLiveStateMap(liveTransportRenderState.value))
  const globalOutputMode = computed(() => normaliseOutputMode(outputMode.value))
  const connectionStatus = computed(() => liveUpdate.status.value)
  const currentNudgeStep = computed(() => NUDGE_STEPS[nudgeStepIndex.value] ?? NUDGE_STEPS[0])
  const nudgeSteps = computed(() => NUDGE_STEPS)

  function predictedPlayhead(uid, fallbackPlayhead, isPlaying) {
    const sample = renderSamplesByTransportId[uid]
    const playhead = sample?.playheadLocation ?? fallbackPlayhead

    if (typeof playhead !== 'number' || !Number.isFinite(playhead)) {
      return playhead
    }

    if (!isPlaying || !sample) {
      return playhead
    }

    return playhead + ((renderClock.value - sample.sampledAt) / 1000)
  }

  async function refreshTransports() {
    isLoading.value = true
    lastError.value = ''

    try {
      const data = await getActiveTransportControlTransports()
      apiTransports.value = data.transports ?? data.result ?? []

      const activeExists = apiTransports.value.some((transport) => String(transport.uid) === activeTransportId.value)
      if (!activeExists) {
        activeTransportId.value = apiTransports.value[0] ? String(apiTransports.value[0].uid) : ''
      }
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Failed to load transports'
    } finally {
      isLoading.value = false
    }
  }

  async function loadCues(trackUid) {
    if (!trackUid || cuesByTrackId[trackUid] || loadingCuesByTrackId[trackUid]) {
      return
    }

    loadingCuesByTrackId[trackUid] = true

    try {
      const data = await getTransportControlCues(trackUid)
      cuesByTrackId[trackUid] = (data.cues ?? []).map((cue, index) => normaliseCue(cue, index, trackUid))
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Failed to load cues'
      cuesByTrackId[trackUid] = []
    } finally {
      loadingCuesByTrackId[trackUid] = false
    }
  }

  const transports = computed(() =>
    apiTransports.value.map((transport) => {
      const uid = String(transport.uid)
      const normalInfo = transport.normalInfo ?? transport
      const live = liveStateByTransportId.value[uid] ?? {}
      const liveRender = liveRenderByTransportId.value[uid] ?? {}
      const playmode = liveRender.playmode ?? live.playmode ?? normalInfo.playmode ?? ''
      const statusString = liveRender.statusString ?? live.statusString ?? ''
      const holdingAtSection = isHoldingAtSection(playmode)
      const playing = isPlayState(playmode) || holdingAtSection
      const playheadLocation = predictedPlayhead(uid, liveRender.playheadLocation, isAdvancingPlayhead(playmode) && !holdingAtSection)
      const setlist = normalInfo.setlist ?? normalInfo.setList ?? EMPTY_SETLIST
      const tracks = (setlist.tracks ?? []).map((track, index) => normaliseTrack(track, index, cuesByTrackId))
      const liveCurrentTrackUid = (liveRender.currentTrackUid ?? live.currentTrackUid)
        ? String(liveRender.currentTrackUid ?? live.currentTrackUid)
        : null
      const apiCurrentTrackUid = normalInfo.currentTrack?.uid ? String(normalInfo.currentTrack.uid) : null
      const viewedTrackUid = liveCurrentTrackUid ?? apiCurrentTrackUid ?? tracks[0]?.id
      const currentTrackIndex = Math.max(
        0,
        tracks.findIndex((track) => track.id === viewedTrackUid),
      )
      const selectedTrack = tracks[currentTrackIndex] ?? tracks[0] ?? EMPTY_TRACK
      const enrichedTracks = tracks.map((track) => ({
        ...track,
        cues: enrichCuesWithPlayback(
          track.cues,
          playheadLocation,
          liveCurrentTrackUid === track.id,
          track.length,
          liveRender.currentSectionIndex ?? live.currentSectionIndex,
          holdingAtSection,
        ),
      }))
      const activeTrack = enrichedTracks[currentTrackIndex] ?? enrichedTracks[0] ?? EMPTY_TRACK
      const allCues = enrichedTracks.flatMap((track) => track.cues)
      const liveCue = allCues.find((cue) => cue.live)

      return {
        id: uid,
        uid,
        name: transport.name || 'Unnamed transport',
        online: true,
        engaged: Boolean(live.engaged ?? transport.engaged),
        playing,
        brightness: percent(live.brightness ?? normalInfo.brightness),
        volume: percent(live.volume ?? normalInfo.volume),
        mode: playmode || 'Unknown',
        timecode: liveRender.monitorString || live.monitorString || formatTimecode(playheadLocation ?? normalInfo.playheadLocation),
        status: statusString ? String(statusString).replace('|', ' - ') : 'No Timecode',
        playheadLocation,
        currentSetlistId: String(setlist.uid ?? EMPTY_SETLIST.id),
        currentTrackIndex,
        liveCueId: liveCue?.id ?? null,
        armedCueId: armedCueByTransportId[uid] ?? allCues[0]?.id ?? null,
        setlists: [
          {
            id: String(setlist.uid ?? EMPTY_SETLIST.id),
            uid: String(setlist.uid ?? EMPTY_SETLIST.id),
            name: setlist.name ?? EMPTY_SETLIST.name,
            tracks: enrichedTracks,
          },
        ],
      }
    }),
  )

  const activeTransport = computed(() =>
    transports.value.find((transport) => transport.id === activeTransportId.value) ?? transports.value[0] ?? EMPTY_TRANSPORT,
  )

  const activeSetlist = computed(() =>
    activeTransport.value.setlists.find((setlist) => setlist.id === activeTransport.value.currentSetlistId) ?? activeTransport.value.setlists[0] ?? EMPTY_SETLIST,
  )

  const activeTrack = computed(() => activeSetlist.value.tracks[activeTransport.value.currentTrackIndex] ?? EMPTY_TRACK)
  const allTransportsEngaged = computed(() => transports.value.length > 0 && transports.value.every((transport) => transport.engaged))

  const visibleCueGroups = computed(() =>
    activeSetlist.value.tracks.map((track) => ({
      id: track.id,
      label: track.number ? `${track.number} - ${track.title}` : track.title,
      cues: track.cues ?? [],
    })),
  )

  const visibleCues = computed(() => visibleCueGroups.value.flatMap((group) => group.cues))

  const armedCue = computed(() =>
    visibleCues.value.find((cue) => cue.id === activeTransport.value.armedCueId) ?? visibleCues.value[0] ?? {
      id: 'no-cue',
      number: '',
      name: 'No cue armed',
    },
  )

  const currentTrackLabel = computed(() => {
    if (!activeTrack.value.title) return 'No track'
    return activeTrack.value.number ? `${activeTrack.value.number} - ${activeTrack.value.title}` : activeTrack.value.title
  })

  function selectTransport(id) {
    activeTransportId.value = id
  }

  function armCue(id) {
    armedCueByTransportId[activeTransport.value.id] = id
  }

  async function runCommand(name, command) {
    pendingCommand.value = name
    lastError.value = ''

    try {
      await command()
      return true
    } catch (error) {
      lastError.value = error instanceof Error ? error.message : 'Command failed'
      return false
    } finally {
      pendingCommand.value = ''
    }
  }

  function armNextCue() {
    const cues = visibleCues.value
    const cueIndex = cues.findIndex((cue) => cue.id === activeTransport.value.armedCueId)
    const nextCue = cues[cueIndex + 1]

    if (nextCue) {
      armedCueByTransportId[activeTransport.value.id] = nextCue.id
    }
  }

  async function fireCue() {
    const cue = armedCue.value
    const transport = activeTransport.value

    if (!cue || !transport || transport.id === EMPTY_TRANSPORT.id) return

    const tagType = cue.tagType ? String(cue.tagType).toUpperCase() : ''
    const commandValue = cue.tagValue || cue.number
    let didFire = false

    if (tagType && commandValue) {
      didFire = await runCommand(`cue:${transport.id}`, () => goToCueTag(transport.id, tagType, commandValue, GO_PLAYMODE))
    }

    if (!didFire && cue.sectionIndex) {
      didFire = await runCommand(`cue:${transport.id}`, async () => {
        if (cue.trackUid && cue.trackUid !== activeTrack.value.id) {
          await goToTrack(transport.id, cue.trackUid)
        }

        await goToSection(transport.id, cue.sectionIndex, GO_PLAYMODE)
      })
    }

    if (!didFire && typeof cue.position === 'number') {
      didFire = await runCommand(`cue:${transport.id}`, async () => {
        if (cue.trackUid && cue.trackUid !== activeTrack.value.id) {
          await goToTrack(transport.id, cue.trackUid)
        }

        await goToTime(transport.id, Math.max(0, cue.position), GO_PLAYMODE)
      })
    }

    if (didFire) {
      armNextCue()
      return
    }
  }

  function toggleEngaged(transport = activeTransport.value) {
    if (!transport || transport.id === EMPTY_TRANSPORT.id) return

    runCommand(`engaged:${transport.id}`, () =>
      transport.engaged ? disengageTransport(transport.id) : engageTransport(transport.id),
    )
  }

  function toggleAllTransportsEngaged() {
    const shouldEngage = !allTransportsEngaged.value
    runCommand('engage-all', () =>
      Promise.all(
        transports.value
          .filter((transport) => transport.id !== EMPTY_TRANSPORT.id)
          .map((transport) => (shouldEngage ? engageTransport(transport.id) : disengageTransport(transport.id))),
      ),
    )
  }

  function toggleTransportPlaying(transport = activeTransport.value) {
    if (!transport || transport.id === EMPTY_TRANSPORT.id) return

    runCommand(`play:${transport.id}`, () => playTransport(transport.id))
  }

  function setTransportStopped(transport = activeTransport.value) {
    if (!transport || transport.id === EMPTY_TRANSPORT.id) return
    runCommand(`stop:${transport.id}`, () => stopTransport(transport.id))
  }

  function nudgeTransportFrame(transport, delta) {
    if (!transport || transport.id === EMPTY_TRANSPORT.id) return
    const currentFrame = Math.round((transport.playheadLocation ?? 0) * FRAME_RATE)
    const frame = Math.max(0, currentFrame + (currentNudgeStep.value.frames * delta))

    runCommand(`frame:${transport.id}`, () => goToFrame(transport.id, frame))
  }

  function toggleNudgeStep() {
    nudgeStepIndex.value = (nudgeStepIndex.value + 1) % NUDGE_STEPS.length
  }

  function selectNudgeStep(index) {
    if (!NUDGE_STEPS[index]) return
    nudgeStepIndex.value = index
  }

  function setTransportBrightnessPercent(transport, value) {
    if (!transport || transport.id === EMPTY_TRANSPORT.id) return
    runCommand(`brightness:${transport.id}`, () => setTransportBrightness(transport.id, toApiLevel(value)))
  }

  function setTransportVolumePercent(transport, value) {
    if (!transport || transport.id === EMPTY_TRANSPORT.id) return
    runCommand(`volume:${transport.id}`, () => setTransportVolume(transport.id, toApiLevel(value)))
  }

  function setGlobalOutputMode(mode) {
    const outputModes = {
      fadeDown: 0,
      fadeUp: 1,
      hold: 2,
    }

    if (outputModes[mode] !== undefined) {
      outputMode.value = outputModes[mode]
    }
  }

  let renderClockTimer = null

  onMounted(() => {
    refreshTransports()
    renderClockTimer = window.setInterval(() => {
      renderClock.value = Date.now()
    }, 50)
  })

  onUnmounted(() => {
    if (renderClockTimer) {
      window.clearInterval(renderClockTimer)
    }
  })

  watch(
    liveTransportRenderState,
    (states) => {
      if (!Array.isArray(states)) return

      const sampledAt = Date.now()
      states.forEach((transport) => {
        if (!transport?.uid || typeof transport.playheadLocation !== 'number') return

        renderSamplesByTransportId[String(transport.uid)] = {
          playheadLocation: transport.playheadLocation,
          sampledAt,
        }
      })
    },
    { immediate: true },
  )

  watch(
    [activeTransportId, nudgeStepIndex, armedCueByTransportId],
    () => {
      writeViewState({
        activeTransportId: activeTransportId.value,
        nudgeStepIndex: nudgeStepIndex.value,
        armedCueByTransportId: { ...armedCueByTransportId },
      })
    },
    { deep: true },
  )

  watch(
    () => activeSetlist.value.tracks.map((track) => track.id).join('|'),
    () => {
      activeSetlist.value.tracks.forEach((track) => {
        if (track.id && track.id !== EMPTY_TRACK.id) {
          loadCues(track.id)
        }
      })
    },
    { immediate: true },
  )

  watch(
    visibleCues,
    (cues) => {
      if (!armedCueByTransportId[activeTransport.value.id] && cues?.[0]) {
        armedCueByTransportId[activeTransport.value.id] = cues[0].id
      }
    },
    { immediate: true },
  )

  return {
    transports,
    activeTransportId,
    globalOutputMode,
    activeTransport,
    activeSetlist,
    activeTrack,
    allTransportsEngaged,
    currentNudgeStep,
    nudgeSteps,
    visibleCueGroups,
    visibleCues,
    armedCue,
    currentTrackLabel,
    connectionStatus,
    isLoading,
    lastError,
    pendingCommand,
    selectTransport,
    armCue,
    fireCue,
    toggleEngaged,
    toggleAllTransportsEngaged,
    toggleTransportPlaying,
    setTransportStopped,
    nudgeTransportFrame,
    toggleNudgeStep,
    selectNudgeStep,
    setTransportBrightnessPercent,
    setTransportVolumePercent,
    setGlobalOutputMode,
  }
}

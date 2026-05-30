const TRANSPORT_API = '/api/session/transport'
const STATUS_API = '/api/session/status'
const NOTES_API = '/api/session'

async function readJson(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function assertDesignerStatus(data, fallbackMessage) {
  if (data?.status && data.status.code !== 0) {
    throw new Error(data.status.message || fallbackMessage)
  }
}

async function getTransport(path) {
  const response = await fetch(`${TRANSPORT_API}${path}`)
  const data = await readJson(response)

  if (!response.ok) {
    throw new Error(data?.status?.message || `Transport API failed: ${response.status}`)
  }

  assertDesignerStatus(data, 'Transport API failed')
  return data
}

async function postTransport(path, body) {
  const response = await fetch(`${TRANSPORT_API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await readJson(response)

  if (!response.ok) {
    throw new Error(data?.status?.message || `Command failed: ${response.status}`)
  }

  assertDesignerStatus(data, 'Command failed')
  return data
}

async function getStatus(path) {
  const response = await fetch(`${STATUS_API}${path}`)
  const data = await readJson(response)

  if (!response.ok) {
    throw new Error(data?.status?.message || `Status API failed: ${response.status}`)
  }

  assertDesignerStatus(data, 'Status API failed')
  return data
}

async function getNotes(path) {
  const response = await fetch(`${NOTES_API}${path}`)
  const data = await readJson(response)

  if (!response.ok) {
    throw new Error(data?.status?.message || `Notes API failed: ${response.status}`)
  }

  assertDesignerStatus(data, 'Notes API failed')
  return data
}

async function postNotes(path, body) {
  const response = await fetch(`${NOTES_API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const data = await readJson(response)

  if (!response.ok) {
    throw new Error(data?.status?.message || `Note update failed: ${response.status}`)
  }

  assertDesignerStatus(data, 'Note update failed')
  return data
}

function transportLocator(uid) {
  return { uid: String(uid) }
}

function commandTransport(uid, fields = {}) {
  return {
    transport: transportLocator(uid),
    ...fields,
  }
}

function findTag(tags = [], type) {
  return tags.find((tag) => String(tag.type).toUpperCase() === type)
}

function cueTime(cue) {
  return cue.section?.time ?? cue.note?.time ?? cue.tags?.[0]?.time ?? 0
}

function cuesFromApi(data, trackUid) {
  return (data.cues ?? [])
    .slice()
    .filter((cue) => cue.section)
    .sort((a, b) => cueTime(a) - cueTime(b))
    .map((cue, index) => {
      const cueTag = findTag(cue.tags, 'CUE')
      const tcTag = findTag(cue.tags, 'TC')
      const time = cueTime(cue)

      return {
        uid: `${trackUid}-${index}`,
        name: cue.note?.text ?? '',
        position: time,
        section: cue.section ?? {
          index: index + 1,
          time,
        },
        cueTag: cueTag?.value ?? '',
        tcTag: tcTag?.value ?? '',
        tags: cue.tags ?? [],
        note: cue.note ?? null,
      }
    })
}

export async function getActiveTransportControlTransports() {
  return getTransport('/activetransport')
}

export async function getTransportControlCues(trackUid) {
  const params = new URLSearchParams({ uid: String(trackUid) })
  const data = await getTransport(`/cues?${params}`)

  return {
    cues: cuesFromApi(data, trackUid),
  }
}

export async function getHealthStatus() {
  return getStatus('/health')
}

export async function getNotesList() {
  return getNotes('/notes')
}

export async function updateNote(note) {
  return postNotes('/note', note)
}

export function playTransport(transportUid) {
  return postTransport('/playsection', {
    transports: [transportLocator(transportUid)],
  })
}

export function stopTransport(transportUid) {
  return postTransport('/stop', {
    transports: [transportLocator(transportUid)],
  })
}

export function engageTransport(transportUid) {
  return postTransport('/engaged', {
    transports: [commandTransport(transportUid, { engaged: true })],
  })
}

export function disengageTransport(transportUid) {
  return postTransport('/engaged', {
    transports: [commandTransport(transportUid, { engaged: false })],
  })
}

export function goToTrack(transportUid, trackUid) {
  return postTransport('/gototrack', {
    transports: [
      commandTransport(transportUid, {
        track: { uid: String(trackUid) },
      }),
    ],
  })
}

export function goToFrame(transportUid, frame, playmode) {
  return postTransport('/gotoframe', {
    transports: [
      commandTransport(transportUid, {
        frame,
        ...(playmode ? { playmode } : {}),
      }),
    ],
  })
}

export function goToTime(transportUid, time, playmode) {
  return postTransport('/gototime', {
    transports: [
      commandTransport(transportUid, {
        time,
        ...(playmode ? { playmode } : {}),
      }),
    ],
  })
}

export function goToSection(transportUid, section, playmode) {
  return postTransport('/gotosection', {
    transports: [
      commandTransport(transportUid, {
        section: String(section),
        ...(playmode ? { playmode } : {}),
      }),
    ],
  })
}

export function goToCueTag(transportUid, type, tag, playmode) {
  return postTransport('/gototag', {
    transports: [
      commandTransport(transportUid, {
        type: String(type).toUpperCase(),
        value: String(tag),
        allowGlobalJump: true,
        ...(playmode ? { playmode } : {}),
      }),
    ],
  })
}

export function setTransportBrightness(transportUid, brightness) {
  return postTransport('/brightness', {
    transports: [commandTransport(transportUid, { brightness })],
  })
}

export function setTransportVolume(transportUid, volume) {
  return postTransport('/volume', {
    transports: [commandTransport(transportUid, { volume })],
  })
}

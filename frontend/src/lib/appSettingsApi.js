async function readJson(response) {
  const text = await response.text()
  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

export async function getAppSettings() {
  const response = await fetch('/app/settings')
  const data = await readJson(response)

  if (!response.ok) {
    throw new Error(data.error || `Settings failed: ${response.status}`)
  }

  return data
}

export async function saveAppSettings(settings) {
  const response = await fetch('/app/settings', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings),
  })
  const data = await readJson(response)

  if (!response.ok) {
    throw new Error(data.error || `Settings save failed: ${response.status}`)
  }

  return data
}

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_SETTINGS = {
  disguiseHost: '192.168.30.101',
  disguisePort: 80,
  appHost: '0.0.0.0',
  appPort: 5180,
  runOnStartup: false,
}

function readSettings(settingsPath) {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')),
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function normaliseSettings(settings) {
  const disguiseHost = String(settings.disguiseHost || DEFAULT_SETTINGS.disguiseHost).trim()
  const disguisePort = Number(settings.disguisePort || DEFAULT_SETTINGS.disguisePort)
  const appHost = String(settings.appHost || DEFAULT_SETTINGS.appHost).trim()
  const appPort = Number(settings.appPort || DEFAULT_SETTINGS.appPort)

  return {
    disguiseHost,
    disguisePort: Number.isInteger(disguisePort) && disguisePort > 0 ? disguisePort : DEFAULT_SETTINGS.disguisePort,
    appHost: appHost || DEFAULT_SETTINGS.appHost,
    appPort: Number.isInteger(appPort) && appPort > 0 ? appPort : DEFAULT_SETTINGS.appPort,
    runOnStartup: Boolean(settings.runOnStartup),
  }
}

function writeSettings(settingsPath, settings) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  const normalised = normaliseSettings(settings)
  fs.writeFileSync(settingsPath, `${JSON.stringify(normalised, null, 2)}\n`)
  return normalised
}

module.exports = {
  DEFAULT_SETTINGS,
  readSettings,
  writeSettings,
  normaliseSettings,
}

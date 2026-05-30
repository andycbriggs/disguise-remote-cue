const fs = require('node:fs')
const path = require('node:path')
const { app, BrowserWindow, Menu, Tray, nativeImage } = require('electron')
const { createDisguiseControlServer } = require('../backend/server.cjs')
const { readSettings } = require('../backend/settings.cjs')

let tray = null
let settingsWindow = null
let serverInfo = null
let server = null
let serverError = null
let savedSettings = null

const SETTINGS_WINDOW_WIDTH = 420
const SETTINGS_WINDOW_HEIGHT = 680
const USER_DATA_DIR_NAME = 'disguise-remote-cue'
const SETTINGS_FILE_NAME = 'settings.json'
const LEGACY_USER_DATA_DIR_NAMES = [
  'disguise remote cue',
  'disguise remote',
  'disguise-remote',
]

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
}

app.setAppUserModelId('remote.disguise.cue')

function createTrayIcon() {
  return nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'app-icon.ico'))
}

function startupPath() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath
}

function applyStartupSetting(settings) {
  app.setLoginItemSettings({
    openAtLogin: Boolean(settings.runOnStartup),
    path: startupPath(),
  })
}

function startupEnabled() {
  return app.getLoginItemSettings({ path: startupPath() }).openAtLogin
}

function configureUserDataPath() {
  const userDataPath = path.join(app.getPath('appData'), USER_DATA_DIR_NAME)
  const settingsPath = path.join(userDataPath, SETTINGS_FILE_NAME)

  if (!fs.existsSync(settingsPath)) {
    const legacySettingsPath = LEGACY_USER_DATA_DIR_NAMES
      .map((dirName) => path.join(app.getPath('appData'), dirName, SETTINGS_FILE_NAME))
      .find((candidate) => fs.existsSync(candidate))

    if (legacySettingsPath) {
      fs.mkdirSync(userDataPath, { recursive: true })
      fs.copyFileSync(legacySettingsPath, settingsPath)
    }
  }

  app.setPath('userData', userDataPath)
  return userDataPath
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function settingsErrorHtml() {
  const port = savedSettings?.appPort || 8088
  const host = savedSettings?.appHost || '0.0.0.0'
  const message = serverError?.code === 'EADDRINUSE'
    ? `Port ${port} is already in use. disguise remote cue did not bind to ${host}:${port}.`
    : (serverError?.message || 'disguise remote cue could not start its local server.')

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>disguise remote cue settings</title>
        <style>
          :root {
            color-scheme: dark;
            font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background: #050607;
            color: #eceef1;
          }
          body {
            margin: 0;
            min-height: 100vh;
            background: #050607;
          }
          main {
            display: grid;
            align-content: start;
            gap: 0.75rem;
            padding: 1rem;
          }
          h1 {
            margin: 0 0 0.25rem;
            font-size: 1rem;
            font-weight: 400;
          }
          p {
            margin: 0;
            color: #939aa4;
            line-height: 1.45;
          }
          .panel {
            display: grid;
            gap: 0.5rem;
            padding: 1rem;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 0.55rem;
            background: #171b20;
          }
          .error {
            color: #fb5f5f;
          }
          code {
            color: #35d27f;
            font-family: "SFMono-Regular", "SF Mono", Consolas, "Liberation Mono", Menlo, monospace;
          }
        </style>
      </head>
      <body>
        <main>
          <div class="panel">
            <h1>Settings unavailable</h1>
            <p class="error">${escapeHtml(message)}</p>
            <p>Close the other process using <code>${escapeHtml(String(port))}</code>, then restart this tray app.</p>
          </div>
        </main>
      </body>
    </html>`
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = new BrowserWindow({
    width: SETTINGS_WINDOW_WIDTH,
    height: SETTINGS_WINDOW_HEIGHT,
    minWidth: SETTINGS_WINDOW_WIDTH,
    maxWidth: SETTINGS_WINDOW_WIDTH,
    minHeight: SETTINGS_WINDOW_HEIGHT,
    maxHeight: SETTINGS_WINDOW_HEIGHT,
    resizable: false,
    useContentSize: true,
    title: 'disguise remote cue settings',
    icon: path.join(__dirname, '..', 'assets', 'app-icon.ico'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  settingsWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      settingsWindow.hide()
    }
  })

  settingsWindow.once('ready-to-show', () => settingsWindow.show())

  if (serverInfo?.url) {
    settingsWindow.loadURL(`${serverInfo.url}/settings`)
  } else {
    settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(settingsErrorHtml())}`)
  }
}

function rebuildTrayMenu() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Settings', click: createSettingsWindow },
    { type: 'separator' },
    ...(serverError ? [{ label: 'Local server not running', enabled: false }] : []),
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      },
    },
  ]))
}

async function start() {
  const distPath = path.join(__dirname, '..', 'frontend', 'dist')
  const settingsPath = path.join(configureUserDataPath(), SETTINGS_FILE_NAME)
  const settings = readSettings(settingsPath)
  savedSettings = settings

  applyStartupSetting(settings)

  server = createDisguiseControlServer({
    distPath,
    settingsPath,
    getRuntimeSettings: () => ({
      runOnStartup: startupEnabled(),
      appVersion: app.getVersion(),
    }),
    onSettingsSaved: applyStartupSetting,
  })

  try {
    serverInfo = await server.start()
  } catch (error) {
    serverError = error
    serverInfo = null
  }

  tray = new Tray(createTrayIcon())
  tray.setToolTip('disguise remote cue')
  tray.on('click', createSettingsWindow)
  rebuildTrayMenu()

  if (serverError) {
    createSettingsWindow()
  }
}

app.on('second-instance', () => {
  createSettingsWindow()
})

app.whenReady().then(start)

app.on('before-quit', () => {
  app.isQuitting = true
  if (server) {
    server.close()
  }
})

app.on('window-all-closed', (event) => {
  event.preventDefault()
})

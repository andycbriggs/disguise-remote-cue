const fs = require('node:fs')
const http = require('node:http')
const net = require('node:net')
const os = require('node:os')
const path = require('node:path')
const { readSettings, writeSettings, normaliseSettings } = require('./settings.cjs')

const PROXY_PREFIXES = ['/api', '/docs', '/projects']

function json(response, statusCode, body) {
  const payload = JSON.stringify(body)
  response.writeHead(statusCode, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  })
  response.end(payload)
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', reject)
  })
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.html') return 'text/html; charset=utf-8'
  if (extension === '.js') return 'text/javascript; charset=utf-8'
  if (extension === '.css') return 'text/css; charset=utf-8'
  if (extension === '.svg') return 'image/svg+xml'
  if (extension === '.png') return 'image/png'
  if (extension === '.ico') return 'image/x-icon'
  if (extension === '.json') return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}

function interfaceOptions() {
  const options = [
    {
      name: 'All interfaces',
      address: '0.0.0.0',
      label: 'All interfaces (0.0.0.0)',
    },
  ]

  Object.entries(os.networkInterfaces()).forEach(([name, addresses]) => {
    addresses
      .filter((address) => address && address.family === 'IPv4' && !address.internal)
      .forEach((address) => {
        options.push({
          name,
          address: address.address,
          label: `${name} (${address.address})`,
        })
      })
  })

  return options
}

function localNetworkUrls(port, host) {
  if (host && host !== '0.0.0.0') {
    return [`http://${host}:${port}`]
  }

  return [
    `http://127.0.0.1:${port}`,
    ...interfaceOptions()
      .filter((option) => option.address !== '0.0.0.0')
      .map((option) => `http://${option.address}:${port}`),
  ]
}

function isProxyPath(url) {
  return PROXY_PREFIXES.some((prefix) => url === prefix || url.startsWith(`${prefix}/`))
}

function requestTarget(settings) {
  return {
    host: settings.disguiseHost,
    port: settings.disguisePort,
  }
}

function proxyHttp(request, response, settings) {
  const target = requestTarget(settings)
  const headers = {
    ...request.headers,
    host: `${target.host}:${target.port}`,
  }

  const proxyRequest = http.request(
    {
      hostname: target.host,
      port: target.port,
      method: request.method,
      path: request.url,
      headers,
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers)
      proxyResponse.pipe(response)
    },
  )

  proxyRequest.on('error', (error) => {
    json(response, 502, { error: `Unable to reach disguise at ${target.host}:${target.port}`, detail: error.message })
  })

  request.pipe(proxyRequest)
}

function proxyWebSocket(request, socket, head, settings) {
  if (!request.url.startsWith('/api/session/liveupdate')) {
    socket.destroy()
    return
  }

  const target = requestTarget(settings)
  const targetSocket = net.connect(target.port, target.host)

  targetSocket.once('connect', () => {
    const headers = {
      ...request.headers,
      host: `${target.host}:${target.port}`,
    }
    const headerLines = Object.entries(headers).map(([key, value]) => `${key}: ${value}`)
    targetSocket.write(`${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headerLines.join('\r\n')}\r\n\r\n`)
    if (head.length > 0) {
      targetSocket.write(head)
    }
    socket.pipe(targetSocket).pipe(socket)
  })

  targetSocket.on('error', () => socket.destroy())
  socket.on('error', () => targetSocket.destroy())
}

function serveStatic(request, response, distPath) {
  const requestUrl = new URL(request.url, 'http://localhost')
  const pathname = decodeURIComponent(requestUrl.pathname)
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1)
  const resolvedPath = path.resolve(distPath, relativePath)
  const safeDistPath = path.resolve(distPath)

  let filePath = resolvedPath.startsWith(safeDistPath) ? resolvedPath : path.join(safeDistPath, 'index.html')

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(safeDistPath, 'index.html')
  }

  fs.createReadStream(filePath)
    .on('error', () => {
      response.writeHead(404)
      response.end('Not found')
    })
    .once('open', () => {
      response.writeHead(200, { 'content-type': contentType(filePath) })
    })
    .pipe(response)
}

function createDisguiseControlServer(options) {
  const distPath = options.distPath
  const settingsPath = options.settingsPath
  const getRuntimeSettings = options.getRuntimeSettings ?? (() => ({}))
  const onSettingsSaved = options.onSettingsSaved ?? (() => {})
  let settings = normaliseSettings(readSettings(settingsPath))
  let activePort = settings.appPort
  let activeHost = settings.appHost

  const server = http.createServer(async (request, response) => {
    if (request.url === '/app/settings' && request.method === 'GET') {
      json(response, 200, {
        settings: {
          ...settings,
          ...getRuntimeSettings(),
        },
        interfaceOptions: interfaceOptions(),
        localUrls: localNetworkUrls(activePort, activeHost),
        requiresRestart: settings.appHost !== activeHost || settings.appPort !== activePort,
      })
      return
    }

    if (request.url === '/app/settings' && request.method === 'PUT') {
      try {
        const body = JSON.parse(await readBody(request))
        settings = writeSettings(settingsPath, { ...settings, ...body })
        onSettingsSaved(settings)
        json(response, 200, {
          settings: {
            ...settings,
            ...getRuntimeSettings(),
          },
          interfaceOptions: interfaceOptions(),
          localUrls: localNetworkUrls(activePort, activeHost),
          requiresRestart: settings.appHost !== activeHost || settings.appPort !== activePort,
        })
      } catch (error) {
        json(response, 400, { error: error.message || 'Invalid settings' })
      }
      return
    }

    if (isProxyPath(request.url)) {
      proxyHttp(request, response, settings)
      return
    }

    serveStatic(request, response, distPath)
  })

  server.on('upgrade', (request, socket, head) => {
    proxyWebSocket(request, socket, head, settings)
  })

  function start() {
    return new Promise((resolve, reject) => {
      function onError(error) {
        server.off('listening', onListening)
        reject(error)
      }

      function onListening() {
        server.off('error', onError)
        activePort = server.address().port
        activeHost = settings.appHost
        const localUrlHost = activeHost === '0.0.0.0' ? '127.0.0.1' : activeHost
        resolve({
          port: activePort,
          host: activeHost,
          url: `http://${localUrlHost}:${activePort}`,
          localUrls: localNetworkUrls(activePort, activeHost),
        })
      }

      server.once('error', onError)
      server.once('listening', onListening)
      server.listen(settings.appPort, settings.appHost)
    })
  }

  return {
    start,
    close: () => server.close(),
    getSettings: () => ({ ...settings }),
  }
}

module.exports = {
  createDisguiseControlServer,
}

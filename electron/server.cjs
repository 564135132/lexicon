const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.gz': 'application/gzip',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
}

function writeJson(response, status, payload) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(payload))
}

async function proxyMerriamWebster(request, response, requestUrl, apiKeys) {
  if (request.method !== 'GET') {
    writeJson(response, 405, { error: 'Method not allowed.' })
    return
  }

  const match = requestUrl.pathname.match(/^\/api\/mw\/(learners|collegiate)\/([^/]+)$/)
  if (!match) {
    writeJson(response, 404, { error: 'Unknown dictionary endpoint.' })
    return
  }

  const [, product, encodedWord] = match
  const key = apiKeys[product]
  if (!key) {
    writeJson(response, 503, { error: 'Merriam-Webster API key is not configured.' })
    return
  }

  let word
  try {
    word = decodeURIComponent(encodedWord)
  } catch {
    writeJson(response, 400, { error: 'Invalid word.' })
    return
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const upstream = new URL(`https://www.dictionaryapi.com/api/v3/references/${product}/json/${encodeURIComponent(word)}`)
    upstream.searchParams.set('key', key)
    const upstreamResponse = await fetch(upstream, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const body = Buffer.from(await upstreamResponse.arrayBuffer())
    response.writeHead(upstreamResponse.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, max-age=86400',
    })
    response.end(body)
  } catch {
    writeJson(response, 502, { error: 'Merriam-Webster is temporarily unavailable.' })
  } finally {
    clearTimeout(timer)
  }
}

async function proxyExternalJson(request, response, targetUrl) {
  if (request.method !== 'GET') {
    writeJson(response, 405, { error: 'Method not allowed.' })
    return
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20000)
  try {
    const upstreamResponse = await fetch(targetUrl, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const body = Buffer.from(await upstreamResponse.arrayBuffer())
    response.writeHead(upstreamResponse.status, {
      'Content-Type': upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8',
      'Cache-Control': 'private, max-age=3600',
    })
    response.end(body)
  } catch {
    writeJson(response, 502, { error: 'Upstream service is temporarily unavailable.' })
  } finally {
    clearTimeout(timer)
  }
}

function sendStaticFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase()
  const cacheControl = extension === '.html'
    ? 'no-cache'
    : filePath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=86400'

  response.writeHead(200, {
    'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    'Cache-Control': cacheControl,
  })
  const stream = fs.createReadStream(filePath)
  stream.on('error', () => response.destroy())
  stream.pipe(response)
}

function startRendererServer({ distDir, apiKeys, port = 0 }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)
        if (requestUrl.pathname.startsWith('/api/mw/')) {
          await proxyMerriamWebster(request, response, requestUrl, apiKeys)
          return
        }
        if (requestUrl.pathname.startsWith('/api/datamuse/')) {
          const suffix = requestUrl.pathname.slice('/api/datamuse'.length)
          await proxyExternalJson(request, response, `https://api.datamuse.com${suffix}${requestUrl.search}`)
          return
        }
        if (requestUrl.pathname.startsWith('/api/dictionary/')) {
          const suffix = requestUrl.pathname.slice('/api/dictionary'.length)
          await proxyExternalJson(request, response, `https://api.dictionaryapi.dev/api/v2/entries${suffix}${requestUrl.search}`)
          return
        }
        if (requestUrl.pathname === '/api/translate') {
          await proxyExternalJson(request, response, `https://api.mymemory.translated.net/get${requestUrl.search}`)
          return
        }

        let pathname
        try {
          pathname = decodeURIComponent(requestUrl.pathname)
        } catch {
          response.writeHead(400)
          response.end('Bad request')
          return
        }

        if (pathname === '/') pathname = '/index.html'
        const filePath = path.resolve(distDir, `.${pathname}`)
        const insideDist = filePath === distDir || filePath.startsWith(`${distDir}${path.sep}`)
        if (!insideDist) {
          response.writeHead(403)
          response.end('Forbidden')
          return
        }

        let stats
        try {
          stats = fs.statSync(filePath)
        } catch {
          const acceptsHtml = request.headers.accept?.includes('text/html')
          if (acceptsHtml && !path.extname(pathname)) {
            sendStaticFile(response, path.join(distDir, 'index.html'))
          } else {
            response.writeHead(404)
            response.end('Not found')
          }
          return
        }

        if (stats.isDirectory()) {
          sendStaticFile(response, path.join(filePath, 'index.html'))
          return
        }
        sendStaticFile(response, filePath)
      } catch {
        response.writeHead(500)
        response.end('Internal server error')
      }
    })

    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      resolve({
        port: address.port,
        close: () => new Promise((done) => server.close(done)),
      })
    })
  })
}

module.exports = { startRendererServer }

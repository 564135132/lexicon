import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function merriamWebsterProxy(env) {
  const keys = {
    learners: env.MW_LEARNERS_API_KEY,
    collegiate: env.MW_COLLEGIATE_API_KEY,
  }

  const proxyExternalJson = async (request, response, targetUrl) => {
    if (request.method !== 'GET') {
      response.statusCode = 405
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: 'Method not allowed.' }))
      return
    }

    try {
      const upstreamResponse = await fetch(targetUrl, { headers: { Accept: 'application/json' } })
      const body = Buffer.from(await upstreamResponse.arrayBuffer())
      response.statusCode = upstreamResponse.status
      response.setHeader('Content-Type', upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'private, max-age=3600')
      response.end(body)
    } catch {
      response.statusCode = 502
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: 'Upstream service is temporarily unavailable.' }))
    }
  }

  const middleware = async (request, response, next) => {
    const externalPrefixes = ['/api/datamuse/', '/api/dictionary/']
    const isExternalApi = externalPrefixes.some((prefix) => request.url?.startsWith(prefix))
      || request.url?.startsWith('/api/translate')
    if (!request.url?.startsWith('/api/mw/') && !isExternalApi) {
      next()
      return
    }
    if (request.method !== 'GET') {
      response.statusCode = 405
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: 'Method not allowed.' }))
      return
    }

    if (isExternalApi) {
      const requestUrl = new URL(request.url, 'http://127.0.0.1')
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
      await proxyExternalJson(request, response, `https://api.mymemory.translated.net/get${requestUrl.search}`)
      return
    }

    const requestUrl = new URL(request.url, 'http://127.0.0.1')
    const match = requestUrl.pathname.match(/^\/api\/mw\/(learners|collegiate)\/([^/]+)$/)
    if (!match) {
      response.statusCode = 404
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: 'Unknown dictionary endpoint.' }))
      return
    }

    const [, product, encodedWord] = match
    const key = keys[product]
    if (!key) {
      response.statusCode = 503
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: 'Merriam-Webster API key is not configured.' }))
      return
    }

    let word
    try {
      word = decodeURIComponent(encodedWord)
    } catch {
      response.statusCode = 400
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: 'Invalid word.' }))
      return
    }

    try {
      const upstream = new URL('https://www.dictionaryapi.com/api/v3/references/' + product + '/json/' + encodeURIComponent(word))
      upstream.searchParams.set('key', key)
      const upstreamResponse = await fetch(upstream)
      const body = await upstreamResponse.text()
      response.statusCode = upstreamResponse.status
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'private, max-age=86400')
      response.end(body)
    } catch {
      response.statusCode = 502
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.end(JSON.stringify({ error: 'Merriam-Webster is temporarily unavailable.' }))
    }
  }

  return {
    name: 'merriam-webster-proxy',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), merriamWebsterProxy(env)],
  }
})

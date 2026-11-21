const TRANSLATE_ENDPOINT = '/api/translate'
const CACHE_PREFIX = 'lexicon:zh:v1:'
const CACHE_TTL = 1000 * 60 * 60 * 24 * 30
const REQUEST_TIMEOUT = 8000
const MAX_CONCURRENT = 2
const REQUEST_SPACING = 120
const memoryCache = new Map()
const requestQueue = []
let activeRequests = 0

function hashText(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function readCache(key) {
  try {
    const raw = window.localStorage.getItem(key)
    const cached = raw ? JSON.parse(raw) : null
    if (!cached?.savedAt || !cached?.value) return null
    if (Date.now() - cached.savedAt > CACHE_TTL) {
      window.localStorage.removeItem(key)
      return null
    }
    return cached.value
  } catch {
    return null
  }
}

function writeCache(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }))
  } catch {
    // Translation still works when storage is unavailable.
  }
}

function decodeEntities(value) {
  if (!value || typeof document === 'undefined') return value
  const textarea = document.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

function pumpQueue() {
  while (activeRequests < MAX_CONCURRENT && requestQueue.length > 0) {
    const job = requestQueue.shift()
    activeRequests += 1
    job.task()
      .then(job.resolve, job.reject)
      .finally(() => {
        activeRequests -= 1
        window.setTimeout(pumpQueue, REQUEST_SPACING)
      })
  }
}

function enqueue(task) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ task, resolve, reject })
    pumpQueue()
  })
}

function requestTranslation(text) {
  return enqueue(async () => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
    try {
      const url = TRANSLATE_ENDPOINT
        + '?q=' + encodeURIComponent(text)
        + '&langpair=en%7Czh-CN'
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) return ''
      const payload = await response.json()
      if (payload?.quotaFinished || Number(payload?.responseStatus) !== 200) return ''

      const translated = decodeEntities(String(payload?.responseData?.translatedText || ''))
        .replace(/\s+/g, ' ')
        .trim()
      if (!translated || translated.toLowerCase() === text.toLowerCase()) return ''
      return translated
    } catch {
      return ''
    } finally {
      window.clearTimeout(timer)
    }
  })
}

export function translateText(text) {
  const source = String(text || '').replace(/\s+/g, ' ').trim()
  if (!source || !/[a-z]/i.test(source)) return Promise.resolve('')

  const cacheKey = CACHE_PREFIX + hashText(source)
  const pending = memoryCache.get(cacheKey)
  if (pending) return pending

  const cached = readCache(cacheKey)
  if (cached) return Promise.resolve(cached)

  const request = requestTranslation(source).then((value) => {
    if (value) writeCache(cacheKey, value)
    else memoryCache.delete(cacheKey)
    return value
  })
  memoryCache.set(cacheKey, request)
  return request
}

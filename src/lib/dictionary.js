import {
  getWordStems,
  isVariantOf,
  sortMeanings,
  uniqueWords,
} from './text'

const DICTIONARY_ENDPOINT = '/api/dictionary/en'
const DATAMUSE_ENDPOINT = '/api/datamuse'
const MW_PROXY_ENDPOINT = '/api/mw'
const MW_PRODUCTS = ['learners', 'collegiate']
const MW_SOURCE_NAMES = {
  learners: "Merriam-Webster's Learner's Dictionary",
  collegiate: "Merriam-Webster's Collegiate Dictionary",
}
const CACHE_PREFIX = 'lexicon:data:v6:'
const SENSE_CACHE_PREFIX = 'lexicon:sense:v4:'
const RECENT_KEY = 'lexicon:recent:v1'
const RECENT_LIMIT = 100
const CACHE_TTL = 1000 * 60 * 60 * 24 * 7
const REQUEST_TIMEOUT = 12000

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'by',
  'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'this', 'that',
  'these', 'those', 'it', 'as', 'at', 'not', 'but', 'if', 'then', 'than', 'so',
  'such', 'can', 'could', 'would', 'should', 'may', 'might', 'will', 'just',
  'very', 'more', 'most', 'much', 'many', 'some', 'any', 'all', 'each', 'every',
  'no', 'nor', 'do', 'does', 'did', 'have', 'has', 'had', 'you', 'your', 'he',
  'she', 'they', 'we', 'i', 'me', 'my', 'our', 'their', 'his', 'her', 'them',
  'us', 'who', 'what', 'which', 'when', 'where', 'why', 'how',
])

export class DictionaryNotFoundError extends Error {
  constructor(word) {
    super(`No dictionary entry found for "${word}".`)
    this.name = 'DictionaryNotFoundError'
    this.word = word
  }
}

function readStorage(key) {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Private browsing or a full storage quota should not break the dictionary.
  }
}

function readCache(word) {
  const cached = readStorage(`${CACHE_PREFIX}${word}`)
  if (!cached?.savedAt || !cached?.value) return null
  if (Date.now() - cached.savedAt > CACHE_TTL) {
    try {
      window.localStorage.removeItem(`${CACHE_PREFIX}${word}`)
    } catch {
      // Ignore storage failures.
    }
    return null
  }
  return cached.value
}

function writeCache(word, value) {
  writeStorage(`${CACHE_PREFIX}${word}`, { savedAt: Date.now(), value })
}

async function fetchJson(url, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      const error = new Error(`Request failed with status ${response.status}.`)
      error.status = response.status
      throw error
    }
    return await response.json()
  } finally {
    window.clearTimeout(timer)
  }
}

function safeDatamuse(url) {
  return fetchJson(url).catch(() => [])
}

function normalizeEntry(payload, fallbackWord) {
  const entries = Array.isArray(payload) ? payload : []
  const meaningsByPart = new Map()
  const sourceUrls = []
  let word = fallbackWord
  let phonetic = ''
  let audio = ''
  let license = null

  for (const entry of entries) {
    if (!word && entry.word) word = entry.word
    if (!phonetic && entry.phonetic) phonetic = entry.phonetic
    if (!phonetic) {
      phonetic = entry.phonetics?.find((item) => item?.text)?.text || ''
    }
    if (!audio) {
      const audioOptions = (entry.phonetics || []).filter((item) => item?.audio)
      const selected = audioOptions.find((item) => /-us\./i.test(item.audio))
        || audioOptions.find((item) => /-uk\./i.test(item.audio))
        || audioOptions[0]
      if (selected) {
        audio = selected.audio
      }
    }
    if (entry.sourceUrls) sourceUrls.push(...entry.sourceUrls)
    if (!license && entry.license) license = entry.license

    for (const meaning of entry.meanings || []) {
      const partOfSpeech = (meaning.partOfSpeech || 'unknown').toLowerCase()
      if (!meaningsByPart.has(partOfSpeech)) {
        meaningsByPart.set(partOfSpeech, {
          partOfSpeech,
          definitions: [],
          synonyms: [],
          antonyms: [],
        })
      }
      const target = meaningsByPart.get(partOfSpeech)
      for (const definition of meaning.definitions || []) {
        if (!definition?.definition) continue
        target.definitions.push({
          definition: definition.definition,
          example: typeof definition.example === 'string' ? definition.example : '',
          synonyms: definition.synonyms || [],
          antonyms: definition.antonyms || [],
        })
        target.synonyms.push(...(definition.synonyms || []))
        target.antonyms.push(...(definition.antonyms || []))
      }
      target.synonyms.push(...(meaning.synonyms || []))
      target.antonyms.push(...(meaning.antonyms || []))
    }
  }

  const meanings = sortMeanings([...meaningsByPart.values()].map((meaning) => {
    const seenDefinitions = new Set()
    return {
      ...meaning,
      definitions: meaning.definitions.filter((definition) => {
        const key = `${definition.definition}|${definition.example}`.toLowerCase()
        if (seenDefinitions.has(key)) return false
        seenDefinitions.add(key)
        return true
      }),
      synonyms: uniqueWords(meaning.synonyms),
      antonyms: uniqueWords(meaning.antonyms),
    }
  }).filter((meaning) => meaning.definitions.length > 0))

  if (!meanings.length) throw new DictionaryNotFoundError(fallbackWord)

  return {
    word: word || fallbackWord,
    phonetic: phonetic || '/—/',
    audio,
    meanings,
    totalDefinitions: meanings.reduce((total, meaning) => total + meaning.definitions.length, 0),
    sourceUrls: [...new Set(sourceUrls)],
    license,
    source: 'wiktionary',
    sourceName: 'Wiktionary',
    sourceUrl: sourceUrls[0] || 'https://en.wiktionary.org/',
  }
}

function cleanMwText(value = '') {
  return String(value)
    .replace(/\{bc\}/g, ' — ')
    .replace(/\{ldquo\}/g, '“')
    .replace(/\{rdquo\}/g, '”')
    .replace(/\{lsquo\}/g, '‘')
    .replace(/\{rsquo\}/g, '’')
    .replace(/\{mdash\}/g, '—')
    .replace(/\{ndash\}/g, '–')
    .replace(/\{nbsp\}/g, ' ')
    .replace(/\{p_br\}/g, ' ')
    .replace(/\{\/?(?:it|wi|sc|sup|inf|sub|b|strong|em|i)\}/g, '')
    .replace(/\{[a-z_]+\|([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{[^}]+\}/g, '')
    .replace(/^\s*(?:—|•)\s*/, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function collectMwSenses(node, output) {
  if (!Array.isArray(node)) return
  if (node[0] === 'sense' && node[1] && typeof node[1] === 'object') {
    output.push(node[1])
    return
  }
  node.forEach((child) => collectMwSenses(child, output))
}

function collectMwSenseContent(parts) {
  const texts = []
  const examples = []

  const visit = (node) => {
    if (!Array.isArray(node)) return
    if (typeof node[0] !== 'string') {
      node.forEach(visit)
      return
    }

    const [type, value] = node
    if (type === 'text' && typeof value === 'string') {
      texts.push(cleanMwText(value))
      return
    }
    if (type === 'vis' && Array.isArray(value)) {
      value.forEach((example) => {
        const text = cleanMwText(example?.t || '')
        if (text) examples.push(text)
      })
      return
    }
    if (type === 'sdsense') return
    if (Array.isArray(value)) visit(value)
  }

  ;(parts || []).forEach(visit)
  return {
    text: texts.filter(Boolean).join(' ').trim(),
    examples,
  }
}

function parseMwEntry(entry) {
  const senses = []
  const definitions = []

  for (const block of entry.def || []) collectMwSenses(block.sseq, senses)

  for (const sense of senses) {
    const main = collectMwSenseContent(sense.dt)
    let text = main.text
    let examples = [...main.examples]

    if (sense.sdsense) {
      const secondary = collectMwSenseContent(sense.sdsense.dt)
      if (secondary.text) text = text ? text + '; ' + secondary.text : secondary.text
      examples = [...examples, ...secondary.examples]
    }
    if (sense.sls?.length) text = '(' + sense.sls.join(', ') + ') ' + text

    text = cleanMwText(text)
    if (!text) continue
    definitions.push({
      definition: text,
      example: examples.find(Boolean) || '',
      synonyms: [],
      antonyms: [],
    })
  }

  if (!definitions.length) {
    for (const item of entry.shortdef || []) {
      const text = cleanMwText(item)
      if (text) {
        definitions.push({
          definition: text,
          example: '',
          synonyms: [],
          antonyms: [],
        })
      }
    }
  }

  return definitions
}

function normalizeMwPartOfSpeech(value) {
  const normalized = String(value || 'unknown').toLowerCase().replace(/\s+/g, ' ').trim()
  const aliases = {
    'helping verb': 'auxiliary verb',
    'noun plural': 'noun',
    'plural noun': 'noun',
    'noun singular': 'noun',
    'singular noun': 'noun',
    'verb phrase': 'phrase',
    'adjective phrase': 'phrase',
    'adverb phrase': 'phrase',
    'biographical name': 'proper noun',
    'geographical name': 'proper noun',
  }
  return aliases[normalized] || normalized
}

function mwAudioUrl(audio) {
  const subdirectory = audio.startsWith('bix')
    ? 'bix'
    : audio.startsWith('gg')
      ? 'gg'
      : /^[0-9]/.test(audio)
        ? 'number'
        : audio[0].toLowerCase()
  return 'https://media.merriam-webster.com/audio/prons/en/us/mp3/' + subdirectory + '/' + audio + '.mp3'
}

function normalizeMerriamEntry(entries, fallbackWord, product) {
  const meaningsByPart = new Map()
  let word = fallbackWord
  let phonetic = ''
  let audio = ''

  for (const entry of entries) {
    const id = String(entry.meta?.id || fallbackWord).replace(/:\d+$/, '')
    if (id) word = id

    const pronunciations = entry.hwi?.prs || []
    if (!phonetic) {
      const ipa = pronunciations.find((item) => item?.ipa)?.ipa
      const spelled = pronunciations.find((item) => item?.mw)?.mw
      if (ipa) phonetic = '/' + ipa + '/'
      else if (spelled) phonetic = '/' + spelled + '/'
    }
    if (!audio) {
      const sound = pronunciations.find((item) => item?.sound?.audio)?.sound?.audio
      if (sound) audio = mwAudioUrl(sound)
    }

    const partOfSpeech = normalizeMwPartOfSpeech(entry.fl)
    const definitions = parseMwEntry(entry)
    if (!definitions.length) continue

    if (!meaningsByPart.has(partOfSpeech)) {
      meaningsByPart.set(partOfSpeech, {
        partOfSpeech,
        definitions: [],
        synonyms: [],
        antonyms: [],
      })
    }
    meaningsByPart.get(partOfSpeech).definitions.push(...definitions)
  }

  const meanings = sortMeanings([...meaningsByPart.values()].map((meaning) => {
    const seen = new Set()
    return {
      ...meaning,
      definitions: meaning.definitions.filter((definition) => {
        const key = definition.definition.toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }),
    }
  }).filter((meaning) => meaning.definitions.length > 0))

  if (!meanings.length) throw new DictionaryNotFoundError(fallbackWord)

  const sourceUrl = 'https://www.merriam-webster.com/dictionary/' + encodeURIComponent(word)
  return {
    word,
    phonetic: phonetic || '/—/',
    audio,
    meanings,
    totalDefinitions: meanings.reduce((total, meaning) => total + meaning.definitions.length, 0),
    sourceUrls: [sourceUrl],
    license: null,
    source: 'merriam-webster',
    sourceName: MW_SOURCE_NAMES[product],
    sourceUrl,
    product,
  }
}

async function fetchMerriamEntry(word) {
  for (const product of MW_PRODUCTS) {
    try {
      const payload = await fetchJson(MW_PROXY_ENDPOINT + '/' + product + '/' + encodeURIComponent(word))
      const entries = Array.isArray(payload)
        ? payload.filter((entry) => (
            entry
            && typeof entry === 'object'
            && String(entry.meta?.id || '').toLowerCase().replace(/:\d+$/, '') === word
          ))
        : []
      if (entries.length) return normalizeMerriamEntry(entries, word, product)
    } catch {
      // Try the next Merriam-Webster product, then the free Wiktionary fallback.
    }
  }
  return null
}

function shapePhrases(candidates, word) {
  const seen = new Set()
  return candidates
    .map((candidate) => String(candidate?.word || '').trim().toLowerCase())
    .filter((candidate) => {
      if (!candidate || candidate === word || seen.has(candidate)) return false
      const phraseLike = candidate.includes(' ') || candidate.includes('-')
      if (!phraseLike || candidate.length > 48) return false
      if (!/[a-z]/.test(candidate)) return false
      seen.add(candidate)
      return true
    })
    .slice(0, 10)
}

function shapeVariants(candidates, word) {
  const seen = new Set()
  return candidates
    .map((candidate) => String(candidate?.word || '').trim().toLowerCase())
    .filter((candidate) => {
      if (!candidate || seen.has(candidate) || !isVariantOf(word, candidate)) return false
      seen.add(candidate)
      return true
    })
    .slice(0, 12)
}

function shapeRelated(candidates, word) {
  const blocked = new Set([word])
  const seen = new Set()
  return candidates
    .map((candidate) => String(candidate?.word || '').trim().toLowerCase())
    .filter((candidate) => {
      if (!candidate || blocked.has(candidate) || seen.has(candidate)) return false
      if (STOPWORDS.has(candidate) || !/[a-z]/.test(candidate)) return false
      if (candidate.includes(' ') && candidate.split(' ').length > 3) return false
      if (candidate.length > 32) return false
      seen.add(candidate)
      return true
    })
    .slice(0, 10)
}

function shapeRelations(candidates, word) {
  const byPart = {}
  const seenByPart = {}
  const partTags = {
    n: 'noun',
    v: 'verb',
    adj: 'adjective',
    adv: 'adverb',
  }

  for (const candidate of candidates) {
    const value = String(candidate?.word || '').trim().toLowerCase()
    if (!value || value === word || !/[a-z]/.test(value)) continue
    if (STOPWORDS.has(value) || value.length > 32) continue

    for (const tag of candidate.tags || []) {
      const partOfSpeech = partTags[tag]
      if (!partOfSpeech) continue
      if (!byPart[partOfSpeech]) {
        byPart[partOfSpeech] = []
        seenByPart[partOfSpeech] = new Set()
      }
      if (seenByPart[partOfSpeech].has(value) || byPart[partOfSpeech].length >= 20) continue
      seenByPart[partOfSpeech].add(value)
      byPart[partOfSpeech].push(value)
    }
  }

  return byPart
}

async function fetchExtras(word) {
  const stems = getWordStems(word)
  const variantRequests = stems.map((stem) => safeDatamuse(
    `${DATAMUSE_ENDPOINT}/words?sp=${encodeURIComponent(stem)}*&max=25`,
  ))
  const [
    phrasesAhead,
    phrasesBehind,
    relatedByMeaning,
    synonyms,
    antonyms,
    ...variantResults
  ] = await Promise.all([
    safeDatamuse(`${DATAMUSE_ENDPOINT}/words?sp=${encodeURIComponent(word)}%20*&max=18`),
    safeDatamuse(`${DATAMUSE_ENDPOINT}/words?sp=*%20${encodeURIComponent(word)}&max=18`),
    safeDatamuse(`${DATAMUSE_ENDPOINT}/words?ml=${encodeURIComponent(word)}&max=14`),
    safeDatamuse(`${DATAMUSE_ENDPOINT}/words?rel_syn=${encodeURIComponent(word)}&md=p&max=40`),
    safeDatamuse(`${DATAMUSE_ENDPOINT}/words?rel_ant=${encodeURIComponent(word)}&md=p&max=40`),
    ...variantRequests,
  ])

  return {
    phrases: shapePhrases([...phrasesAhead, ...phrasesBehind], word),
    variants: shapeVariants(variantResults.flat(), word),
    related: shapeRelated(relatedByMeaning, word),
    synonyms: shapeRelations(synonyms, word),
    antonyms: shapeRelations(antonyms, word),
  }
}

function attachMwRelations(entry, extras) {
  if (entry.source !== 'merriam-webster') return entry
  return {
    ...entry,
    meanings: entry.meanings.map((meaning) => ({
      ...meaning,
      synonyms: (extras.synonyms?.[meaning.partOfSpeech] || []).slice(0, 20),
      antonyms: (extras.antonyms?.[meaning.partOfSpeech] || []).slice(0, 12),
    })),
  }
}

export async function fetchWordData(word) {
  const cached = readCache(word)
  if (cached) return cached

  const extrasRequest = fetchExtras(word).catch(() => ({
    phrases: [],
    variants: [],
    related: [],
    synonyms: {},
    antonyms: {},
  }))

  let entry = await fetchMerriamEntry(word)
  if (!entry) {
    let payload
    try {
      payload = await fetchJson(`${DICTIONARY_ENDPOINT}/${encodeURIComponent(word)}`)
    } catch (error) {
      if (error?.status === 404) throw new DictionaryNotFoundError(word)
      throw error
    }
    entry = normalizeEntry(payload, word)
  }

  const extras = await extrasRequest
  entry = attachMwRelations(entry, extras)
  const relationWords = [
    ...Object.values(extras.synonyms || {}).flat(),
    ...Object.values(extras.antonyms || {}).flat(),
  ]
  const synonymSet = new Set([
    ...entry.meanings.flatMap((meaning) => [...meaning.synonyms, ...meaning.antonyms]),
    ...relationWords,
  ].map((item) => item.toLowerCase()))
  const duplicateTerms = new Set([...extras.phrases, ...extras.variants].map((item) => item.toLowerCase()))
  const value = {
    entry,
    extras: {
      ...extras,
      related: extras.related.filter((item) => !synonymSet.has(item.toLowerCase()) && !duplicateTerms.has(item.toLowerCase())),
    },
  }
  writeCache(word, value)
  return value
}

function hashSenseKey(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function readSenseCache(key) {
  const cached = readStorage(key)
  if (!cached?.savedAt || !cached?.value) return null
  if (Date.now() - cached.savedAt > CACHE_TTL) {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // Ignore storage failures.
    }
    return null
  }
  return cached.value
}

export async function fetchSenseRelations(definition, synonyms = [], antonyms = []) {
  const synonymSet = new Set(uniqueWords(synonyms).map((word) => word.toLowerCase()))
  const antonymSet = new Set(uniqueWords(antonyms).map((word) => word.toLowerCase()))
  if (!synonymSet.size && !antonymSet.size) return { synonyms: [], antonyms: [] }

  const cacheKey = SENSE_CACHE_PREFIX + hashSenseKey([
    definition,
    ...synonymSet,
    '|',
    ...antonymSet,
  ].join('\n'))
  const cached = readSenseCache(cacheKey)
  if (cached) return cached

  let candidates
  try {
    candidates = await fetchJson(`${DATAMUSE_ENDPOINT}/words?ml=${encodeURIComponent(definition)}&max=50`)
  } catch {
    return { synonyms: [], antonyms: [] }
  }

  const mappedSynonyms = []
  const mappedAntonyms = []
  for (const [index, candidate] of candidates.entries()) {
    if (index >= 30) break
    const word = String(candidate?.word || '').trim().toLowerCase()
    if (!word || word.includes(' ') || word.length > 32) continue
    if (synonymSet.has(word) && !mappedSynonyms.includes(word) && mappedSynonyms.length < 8) {
      mappedSynonyms.push(word)
    }
    if (antonymSet.has(word) && !mappedAntonyms.includes(word) && mappedAntonyms.length < 6) {
      mappedAntonyms.push(word)
    }
    if (mappedSynonyms.length >= 8 && mappedAntonyms.length >= 6) break
  }

  const value = { synonyms: mappedSynonyms, antonyms: mappedAntonyms }
  writeStorage(cacheKey, { savedAt: Date.now(), value })
  return value
}

export async function fetchSuggestions(word) {
  try {
    const results = await fetchJson(`${DATAMUSE_ENDPOINT}/sug?s=${encodeURIComponent(word)}&max=6`)
    return results.map((item) => item.word).filter(Boolean).slice(0, 6)
  } catch {
    return []
  }
}

export function getRecentSearches() {
  const value = readStorage(RECENT_KEY)
  if (!Array.isArray(value)) return []
  return uniqueWords(value.filter((item) => typeof item === 'string')).slice(0, RECENT_LIMIT)
}

export function addRecentSearch(word) {
  const next = uniqueWords([word, ...getRecentSearches()]).slice(0, RECENT_LIMIT)
  writeStorage(RECENT_KEY, next)
  return next
}

export function clearRecentSearches() {
  writeStorage(RECENT_KEY, [])
  return []
}

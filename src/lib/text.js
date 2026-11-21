const WORD_PATTERN = /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g

const VARIANT_SUFFIXES = [
  's', 'es', 'ed', 'ing', 'er', 'ers', 'est', 'ly', 'ness', 'ful', 'fully',
  'less', 'lessly', 'ish', 'ies', 'ied', 'ier', 'iest', 'ous', 'ously',
  'ious', 'iously', 'ment', 'ments', 'able', 'ably', 'ible', 'ibly',
]

const SUGGESTED_WORDS = ['serendipity', 'resilient', 'petrichor', 'liminal', 'wanderlust', 'eloquent']

const LOOKUP_STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'than', 'as', 'of', 'to', 'in', 'on',
  'at', 'by', 'for', 'from', 'with', 'without', 'about', 'into', 'over', 'under', 'after',
  'before', 'between', 'through', 'during', 'is', 'am', 'are', 'was', 'were', 'be', 'been',
  'being', 'do', 'does', 'did', 'have', 'has', 'had', 'can', 'could', 'will', 'would', 'shall',
  'should', 'may', 'might', 'must', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him',
  'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these',
  'those', 'there', 'here', 'what', 'which', 'who', 'whom', 'whose', 'when', 'where', 'why',
  'how', 'not', 'no', 'yes', 'so', 'too', 'very', 'just', 'also', 'only', 'all', 'any', 'some',
  'more', 'most', 'such', 'one', 'two', 'up', 'down', 'out', 'off',
])

export function normalizeWord(value = '') {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[\s"'“”‘’()[\]{}.,;:!?—–-]+|[\s"'“”‘’()[\]{}.,;:!?—–-]+$/g, '')
    .replace(/\s+/g, ' ')
}

export function isSingleWord(value) {
  return /^[a-z]+(?:['’\-][a-z]+)*$/.test(value)
}

export function tokenizeText(text = '') {
  const parts = []
  let cursor = 0
  for (const match of text.matchAll(WORD_PATTERN)) {
    if (match.index > cursor) {
      parts.push({ type: 'text', value: text.slice(cursor, match.index) })
    }
    parts.push({ type: 'word', value: match[0] })
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) {
    parts.push({ type: 'text', value: text.slice(cursor) })
  }
  return parts
}

export function getWordStems(word) {
  const stems = new Set([word])
  if (word.length > 2 && word.endsWith('y')) stems.add(`${word.slice(0, -1)}i`)
  if (word.length > 3 && word.endsWith('e')) stems.add(word.slice(0, -1))
  if (word.length > 3 && word.endsWith('ie')) stems.add(`${word.slice(0, -2)}y`)
  return [...stems]
}

export function isVariantOf(base, candidate) {
  const word = candidate.toLowerCase()
  if (!word || word === base || !/^[a-z]+$/.test(word)) return false
  const stems = getWordStems(base)
  return stems.some((stem) => {
    if (word.startsWith(stem)) {
      const remainder = word.slice(stem.length)
      if (VARIANT_SUFFIXES.includes(remainder)) return true
    }
    if (base.length > 2 && word.startsWith(base + base[base.length - 1])) {
      const remainder = word.slice(base.length + 1)
      if (VARIANT_SUFFIXES.includes(remainder)) return true
    }
    return false
  })
}

export function variantLabel(word) {
  const lower = word.toLowerCase()
  if (lower.endsWith('ingly')) return '副词'
  if (lower.endsWith('ing')) return '现在分词'
  if (lower.endsWith('ied') || lower.endsWith('ed')) return '过去式 / 过去分词'
  if (lower.endsWith('ies')) return '复数 / 第三人称单数'
  if (lower.endsWith('s')) return '复数 / 第三人称单数'
  if (lower.endsWith('iest') || lower.endsWith('est')) return '最高级'
  if (lower.endsWith('ier') || lower.endsWith('er')) return '比较级 / 施事名词'
  if (lower.endsWith('ly')) return '副词'
  if (lower.endsWith('ness')) return '名词'
  if (lower.endsWith('ment') || lower.endsWith('ation') || lower.endsWith('ity')) return '名词'
  if (lower.endsWith('ful') || lower.endsWith('less') || lower.endsWith('ous') || lower.endsWith('able') || lower.endsWith('ible')) return '形容词'
  if (lower.endsWith('al') || lower.endsWith('ic') || lower.endsWith('ish')) return '形容词'
  return '相关词形'
}

export function uniqueWords(values = []) {
  const seen = new Set()
  return values.filter((value) => {
    const key = String(value).trim().toLowerCase()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function extractLookupWords(text = '') {
  const seen = new Set()
  const words = []
  for (const match of String(text).matchAll(WORD_PATTERN)) {
    const word = normalizeWord(match[0]).replace(/’/g, "'")
    if (!isSingleWord(word) || seen.has(word)) continue
    seen.add(word)
    words.push(word)
  }
  const contentWords = words.filter((word) => !LOOKUP_STOP_WORDS.has(word))
  return contentWords.length > 0
    ? [...contentWords, ...words.filter((word) => LOOKUP_STOP_WORDS.has(word))]
    : words
}

export function getLookupWord(text = '') {
  const normalized = normalizeWord(text).replace(/’/g, "'")
  if (isSingleWord(normalized)) return normalized
  return extractLookupWords(text)[0] || ''
}

export function sortMeanings(meanings) {
  const order = ['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection', 'determiner', 'numeral']
  return [...meanings].sort((a, b) => {
    const ai = order.indexOf(a.partOfSpeech)
    const bi = order.indexOf(b.partOfSpeech)
    if (ai === -1 && bi === -1) return a.partOfSpeech.localeCompare(b.partOfSpeech)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

export { SUGGESTED_WORDS }

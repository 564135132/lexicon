// 拼写相似度工具：纯函数，方便单测，也不依赖浏览器环境。

const MAX_WORD_LENGTH = 40
const WORD_PATTERN = /^[a-z][a-z' -]*$/

export function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase()
}

// Damerau-Levenshtein（最优字符串对齐）。相邻字母互换只算一次编辑，
// 这样 "recieve" → "receive" 的距离是 1，而不是 2。
export function editDistance(a, b) {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const rows = a.length + 1
  const cols = b.length + 1
  const table = Array.from({ length: rows }, (_, row) => {
    const line = new Array(cols).fill(0)
    line[0] = row
    return line
  })
  for (let col = 0; col < cols; col += 1) table[0][col] = col

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      table[i][j] = Math.min(
        table[i - 1][j] + 1,
        table[i][j - 1] + 1,
        table[i - 1][j - 1] + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        table[i][j] = Math.min(table[i][j], table[i - 2][j - 2] + 1)
      }
    }
  }

  return table[a.length][b.length]
}

function jaro(a, b) {
  if (a === b) return 1
  if (!a.length || !b.length) return 0

  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aMatched = new Array(a.length).fill(false)
  const bMatched = new Array(b.length).fill(false)
  let matches = 0

  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - range)
    const end = Math.min(i + range + 1, b.length)
    for (let j = start; j < end; j += 1) {
      if (bMatched[j] || a[i] !== b[j]) continue
      aMatched[i] = true
      bMatched[j] = true
      matches += 1
      break
    }
  }
  if (!matches) return 0

  let transpositions = 0
  let index = 0
  for (let i = 0; i < a.length; i += 1) {
    if (!aMatched[i]) continue
    while (!bMatched[index]) index += 1
    if (a[i] !== b[index]) transpositions += 1
    index += 1
  }
  transpositions /= 2

  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3
}

// Jaro-Winkler：对共同前缀加权，是拼写纠错里更常用的相似度。
export function jaroWinkler(a, b) {
  const base = jaro(a, b)
  let prefix = 0
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix += 1
  return Math.min(1, base + prefix * 0.1 * (1 - base))
}

// 0~1 的相似度：Jaro-Winkler 与编辑距离各占一部分，再给前缀相同一点加成。
export function similarity(query, candidate) {
  const q = normalizeText(query)
  const word = normalizeText(candidate)
  if (!q || !word) return 0
  if (q === word) return 1

  const longest = Math.max(q.length, word.length)
  const normalized = 1 - editDistance(q, word) / longest
  let score = jaroWinkler(q, word) * 0.55 + normalized * 0.45
  // 只在“输入的词是候选词的前缀”时加分（补全场景），
  // 反向的“候选词是输入的前缀”不奖励，否则 “helo” 会优先推荐 “hel”。
  if (word.startsWith(q)) score += 0.05
  return Math.min(1, Math.max(0, score))
}

// 按相似度从高到低排序，去掉重复项、完全相同的词和不能单独查询的词组。
export function rankWords(query, words, limit = 6) {
  const q = normalizeText(query)
  if (!q) return []

  const allowPhrases = q.includes(' ')
  const seen = new Set()
  const ranked = []

  for (const raw of words ?? []) {
    const word = normalizeText(raw)
    if (!word || word === q || word.length > MAX_WORD_LENGTH) continue
    if (!allowPhrases && word.includes(' ')) continue
    if (!WORD_PATTERN.test(word)) continue
    if (seen.has(word)) continue
    seen.add(word)
    ranked.push({ word, score: similarity(q, word) })
  }

  // 稳定排序：分数相同时保留传入顺序（最近查过的词、数据源本身的排序）。
  ranked.sort((a, b) => b.score - a.score)
  return ranked.slice(0, limit)
}

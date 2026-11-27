import { getCachedWords, getRecentSearches } from './dictionary'
import { rankWords } from './fuzzy'
import { loadCommonWords } from './wordlist'

export const SUGGESTION_LIMIT = 6

let wordListCache = null

async function getWordList() {
  if (!wordListCache) {
    const known = await loadCommonWords()
    wordListCache = [...known]
  }
  return wordListCache
}

function localWords() {
  return [...getRecentSearches(), ...getCachedWords()]
}

// 先用长度筛选（编辑距离超过 2 的基本可以排除），再补上前缀补全的候选。
function candidatesFor(query, words) {
  const q = query.toLowerCase()
  const min = Math.max(2, q.length - 2)
  const max = q.length + 2
  const candidates = []

  for (const word of words) {
    if (word.startsWith(q)) {
      if (word.length <= q.length + 14) candidates.push(word)
    } else if (word.length >= min && word.length <= max) {
      candidates.push(word)
    }
  }

  return candidates
}

// 本地候选（最近查过 + 已缓存的词）的即时结果，用于输入瞬间先显示一版。
export function rankLocalSuggestions(query, limit = SUGGESTION_LIMIT) {
  return rankWords(query, localWords(), limit)
}

export async function getSuggestions(query, limit = SUGGESTION_LIMIT) {
  const words = await getWordList()
  return rankWords(query, [...localWords(), ...candidatesFor(query, words)], limit)
}

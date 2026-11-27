// 收藏单词：本机 localStorage +（登录后）Supabase 云同步。
// 云端读写由 account.js / useAccount.js 处理，这里只负责本地状态与变更事件。
const STORAGE_KEY = 'lexicon:favorites:v1'
const MAX_FAVORITES = 500

export const FAVORITES_CHANGED_EVENT = 'lexicon:favorites-changed'

function normalize(word) {
  return String(word ?? '').trim().toLowerCase()
}

function normalizeList(items) {
  const seen = new Set()
  const list = []
  for (const item of items ?? []) {
    const word = normalize(typeof item === 'string' ? item : item?.word)
    if (!word || seen.has(word)) continue
    seen.add(word)
    list.push({ word, addedAt: typeof item?.addedAt === 'string' ? item.addedAt : '' })
  }
  return list
    .sort((a, b) => (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0))
    .slice(0, MAX_FAVORITES)
}

function readFavorites() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? normalizeList(parsed) : []
  } catch {
    return []
  }
}

function writeFavorites(list) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 隐私模式或存储已满时仍然返回内存里的结果，界面不会卡住。
  }
  return list
}

function emitChange(word, action) {
  try {
    window.dispatchEvent(
      new CustomEvent(FAVORITES_CHANGED_EVENT, { detail: { word, action } }),
    )
  } catch {}
}

export function getFavorites() {
  return readFavorites()
}

export function isFavorite(word) {
  const value = normalize(word)
  if (!value) return false
  return readFavorites().some((item) => item.word === value)
}

// 登录合并时用：用合并结果整体替换本地列表（不触发同步事件）。
export function replaceFavorites(items) {
  return writeFavorites(normalizeList(items))
}

export function removeFavorite(word) {
  const value = normalize(word)
  const list = readFavorites().filter((item) => item.word !== value)
  writeFavorites(list)
  emitChange(value, 'remove')
  return list
}

export function toggleFavorite(word) {
  const value = normalize(word)
  if (!value) return readFavorites()
  const list = readFavorites()
  const index = list.findIndex((item) => item.word === value)
  if (index >= 0) {
    list.splice(index, 1)
    writeFavorites(list)
    emitChange(value, 'remove')
    return list
  }
  list.unshift({ word: value, addedAt: new Date().toISOString() })
  const next = writeFavorites(normalizeList(list))
  emitChange(value, 'add')
  return next
}

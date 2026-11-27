const STORAGE_KEY = 'lexicon:backgrounds:v1'
const META_KEY = 'lexicon:backgrounds-meta:v1'

export const SCENIC_PHOTOS = [
  { id: 'lake', src: '/backgrounds/lake.jpg', label: '湖畔小屋' },
  { id: 'forest', src: '/backgrounds/forest.jpg', label: '晨光森林' },
  { id: 'mountains', src: '/backgrounds/mountains.jpg', label: '碧湖轻舟' },
  { id: 'beach', src: '/backgrounds/beach.jpg', label: '海岸日出' },
  { id: 'calm-lake', src: '/backgrounds/calm-lake.jpg', label: '山谷湖光' },
  { id: 'cliff-coast', src: '/backgrounds/cliff-coast.jpg', label: '红岩静湖' },
  { id: 'deep-forest', src: '/backgrounds/deep-forest.jpg', label: '木桥深林' },
  { id: 'green-hills', src: '/backgrounds/green-hills.jpg', label: '翠谷晨雾' },
  { id: 'misty-hills', src: '/backgrounds/misty-hills.jpg', label: '雾漫山峦' },
  { id: 'mountain-lake', src: '/backgrounds/mountain-lake.jpg', label: '云海雪峰' },
  { id: 'mountain-range', src: '/backgrounds/mountain-range.jpg', label: '紫霞海岸' },
  { id: 'night-peak', src: '/backgrounds/night-peak.jpg', label: '星河群山' },
  { id: 'river-lake', src: '/backgrounds/river-lake.jpg', label: '湖上栈桥' },
  { id: 'rocky-peak', src: '/backgrounds/rocky-peak.jpg', label: '雪岭云峰' },
  { id: 'snow-mountain', src: '/backgrounds/snow-mountain.jpg', label: '云中孤峰' },
  { id: 'snow-peak', src: '/backgrounds/snow-peak.jpg', label: '群山叠翠' },
  { id: 'sunrise-peaks', src: '/backgrounds/sunrise-peaks.jpg', label: '晨光岩谷' },
]

export const ALL_BACKGROUND_IDS = SCENIC_PHOTOS.map((photo) => photo.id)

export function getSelectedBackgroundIds() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...ALL_BACKGROUND_IDS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...ALL_BACKGROUND_IDS]
    const valid = new Set(ALL_BACKGROUND_IDS)
    const selected = [...new Set(parsed.filter((id) => typeof id === 'string' && valid.has(id)))]
    return selected.length ? selected : [...ALL_BACKGROUND_IDS]
  } catch {
    return [...ALL_BACKGROUND_IDS]
  }
}

export function saveSelectedBackgroundIds(ids) {
  return replaceSelectedBackgroundIds(ids, { updatedAt: Date.now() })
}

export function replaceSelectedBackgroundIds(ids, { updatedAt = Date.now() } = {}) {
  const selectedSet = new Set(Array.isArray(ids) ? ids : [])
  const selected = SCENIC_PHOTOS.filter((photo) => selectedSet.has(photo.id)).map((photo) => photo.id)
  const value = selected.length ? selected : [...ALL_BACKGROUND_IDS]
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    window.localStorage.setItem(META_KEY, JSON.stringify({ updatedAt }))
  } catch {}
  return value
}

export function getBackgroundSettingsUpdatedAt() {
  try {
    const raw = window.localStorage.getItem(META_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw)
    return Number.isFinite(parsed?.updatedAt) ? parsed.updatedAt : 0
  } catch {
    return 0
  }
}

export function photosForIds(ids) {
  const selected = new Set(Array.isArray(ids) ? ids : [])
  const photos = SCENIC_PHOTOS.filter((photo) => selected.has(photo.id))
  return photos.length ? photos : SCENIC_PHOTOS
}

// 洗牌（Fisher-Yates）。lastId 表示上一轮最后播放的那张：
// 新一轮的第一张会避开它，否则同一张背景会连续出现两次。
export function shufflePhotos(photos, lastId = null) {
  const list = [...photos]
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  if (lastId && list.length > 1 && list[0]?.id === lastId) {
    const j = 1 + Math.floor(Math.random() * (list.length - 1))
    ;[list[0], list[j]] = [list[j], list[0]]
  }
  return list
}

export function createBackgroundPlayback(photos) {
  return { order: shufflePhotos(photos), cursor: 0, previousId: null }
}

// 播放下一张：一轮内按洗牌顺序走完；走完一轮后重新洗牌，保证“全部播放一遍再进下一轮”。
export function advanceBackgroundPlayback(playback, photos) {
  const shownId = playback.order[playback.cursor]?.id ?? null
  const nextCursor = playback.cursor + 1
  if (nextCursor < playback.order.length) {
    return { ...playback, cursor: nextCursor, previousId: shownId }
  }
  return {
    ...playback,
    order: shufflePhotos(photos, shownId),
    cursor: 0,
    previousId: shownId,
  }
}

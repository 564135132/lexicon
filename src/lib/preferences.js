// 使用偏好：目前只有发音口音（美音 / 英音）。
const STORAGE_KEY = 'lexicon:preferences:v1'

export const ACCENT_OPTIONS = [
  { id: 'us', label: '美音', hint: 'en-US' },
  { id: 'uk', label: '英音', hint: 'en-GB' },
]

export const DEFAULT_PREFERENCES = { accent: 'us' }

const VALID_ACCENTS = new Set(ACCENT_OPTIONS.map((option) => option.id))

export function getPreferences() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    const accent = VALID_ACCENTS.has(parsed?.accent) ? parsed.accent : DEFAULT_PREFERENCES.accent
    return { ...DEFAULT_PREFERENCES, accent }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function savePreferences(next) {
  const current = getPreferences()
  const accent = VALID_ACCENTS.has(next?.accent) ? next.accent : current.accent
  const value = { ...current, ...next, accent }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {}
  return value
}

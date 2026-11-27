const STORAGE_KEY = 'lexicon:profile:v1'

export const MAX_DISPLAY_NAME_LENGTH = 24
export const MAX_AVATAR_DATA_LENGTH = 400000

export function normalizeDisplayName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_DISPLAY_NAME_LENGTH)
}

export function emptyProfile() {
  return { displayName: '', avatarData: '', updatedAt: 0 }
}

export function getLocalProfile() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyProfile()
    const parsed = JSON.parse(raw)
    const avatarData =
      typeof parsed?.avatarData === 'string' && parsed.avatarData.length <= MAX_AVATAR_DATA_LENGTH
        ? parsed.avatarData
        : ''
    return {
      displayName: normalizeDisplayName(parsed?.displayName),
      avatarData,
      updatedAt: Number.isFinite(parsed?.updatedAt) ? parsed.updatedAt : 0,
    }
  } catch {
    return emptyProfile()
  }
}

export function saveLocalProfile(profile, { updatedAt = Date.now() } = {}) {
  const next = {
    displayName: normalizeDisplayName(profile?.displayName),
    avatarData:
      typeof profile?.avatarData === 'string' && profile.avatarData.length <= MAX_AVATAR_DATA_LENGTH
        ? profile.avatarData
        : '',
    updatedAt,
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {}
  return next
}

export function hasProfileData(profile) {
  return Boolean(profile?.displayName || profile?.avatarData)
}

export function profileInitial(profile, fallback = 'L') {
  const source = profile?.displayName || fallback
  return String(source).trim().charAt(0).toUpperCase() || 'L'
}

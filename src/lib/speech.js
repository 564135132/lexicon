// 语音选择：按用户偏好（美音 / 英音）挑系统语音。
const ACCENT_LANG = { us: 'en-US', uk: 'en-GB' }

const VOICE_HINTS = {
  us: /Samantha|Aria|Jenny|Guy|Zira|David|Google US English|Microsoft (Aria|Guy|Jenny)/i,
  uk: /Serena|Kate|Daniel|Oliver|Google UK English|Microsoft (Sonia|Ryan|Libby)/i,
}

export function accentLang(accent = 'us') {
  return ACCENT_LANG[accent] || ACCENT_LANG.us
}

export function getPreferredVoice(accent = 'us') {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const lang = accentLang(accent).toLowerCase()
  const voices = window.speechSynthesis.getVoices()
  const matching = voices.filter((voice) => String(voice.lang || '').replace('_', '-').toLowerCase() === lang)
  const hint = VOICE_HINTS[accent]
  return matching.find((voice) => hint?.test(voice.name)) || matching[0] || null
}

// 兼容旧调用（速查窗仍用美音）。
export function getPreferredAmericanVoice() {
  return getPreferredVoice('us')
}

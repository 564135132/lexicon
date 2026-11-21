export function getPreferredAmericanVoice() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices()
  const americanVoices = voices.filter((voice) => /^en[-_]US$/i.test(voice.lang))
  return americanVoices.find((voice) => /Samantha|Aria|Jenny|Guy|Zira|David|Google US English/i.test(voice.name))
    || americanVoices[0]
    || null
}

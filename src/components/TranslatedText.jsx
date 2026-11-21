import { useEffect, useState } from 'react'
import { translateText } from '../lib/translate'

export function TranslatedText({ text, className }) {
  const [translation, setTranslation] = useState('')

  useEffect(() => {
    let cancelled = false
    translateText(text).then((value) => {
      if (!cancelled) setTranslation(value)
    })
    return () => {
      cancelled = true
    }
  }, [text])

  if (!translation) return null

  return (
    <span className={className} lang="zh-CN" title="机器翻译">
      {translation}
    </span>
  )
}

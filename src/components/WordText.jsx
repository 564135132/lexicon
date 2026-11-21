import { tokenizeText } from '../lib/text'

export function WordLinkText({ text, onLookup, className = '' }) {
  return (
    <span className={className}>
      {tokenizeText(text).map((part, index) => {
        if (part.type === 'text') return part.value
        return (
          <button
            key={`${part.value}-${index}`}
            type="button"
            className="word-link"
            title={`查询“${part.value}”`}
            onClick={(event) => {
              event.stopPropagation()
              onLookup(part.value)
            }}
          >
            {part.value}
          </button>
        )
      })}
    </span>
  )
}

export function WordChip({ word, onLookup, tone = 'default', label }) {
  const isPhrase = /\s/.test(word.trim())
  if (isPhrase) {
    return (
      <span
        className={`word-chip word-chip--${tone} word-chip--phrase`}
        title={label ? `${label}：${word}` : `从“${word}”中选一个词继续查询`}
      >
        <WordLinkText text={word} onLookup={onLookup} />
      </span>
    )
  }

  return (
    <button
      type="button"
      className={`word-chip word-chip--${tone}`}
      title={label ? `${label}：${word}` : `查询“${word}”`}
      onClick={() => onLookup(word)}
    >
      <span>{word}</span>
    </button>
  )
}

export function PhraseLine({ phrase, onLookup }) {
  return (
    <div className="phrase-line">
      <span className="phrase-dash" aria-hidden="true">↳</span>
      <span className="phrase-copy">
        <WordLinkText text={phrase} onLookup={onLookup} />
      </span>
    </div>
  )
}

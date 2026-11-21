import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addRecentSearch,
  clearRecentSearches,
  DictionaryNotFoundError,
  fetchSenseRelations,
  fetchSuggestions,
  fetchWordData,
  getRecentSearches,
} from './lib/dictionary'
import {
  isSingleWord,
  normalizeWord,
  variantLabel,
} from './lib/text'
import { displayPartOfSpeech } from './lib/pos'
import { getPreferredAmericanVoice } from './lib/speech'
import { ArrowIcon, CloseIcon, ExternalIcon, HistoryIcon, QuoteIcon, RotateIcon, SearchIcon, SparkIcon, VolumeIcon } from './components/Icons'
import { FloatingLookup } from './components/FloatingLookup'
import { TranslatedText } from './components/TranslatedText'
import { PhraseLine, WordChip, WordLinkText } from './components/WordText'

const SCENIC_PHOTOS = [
  { src: '/backgrounds/lake.jpg', alt: '' },
  { src: '/backgrounds/forest.jpg', alt: '' },
  { src: '/backgrounds/mountains.jpg', alt: '' },
]

const DEFINITION_PREVIEW_LIMIT = 2
const EMPTY_WORDS = []

function SearchForm({
  value,
  onChange,
  onSubmit,
  onGenerate,
  large = false,
  loading = false,
  generateOpen = false,
  inputRef,
}) {
  return (
    <form className={`search-form ${large ? 'search-form--large' : 'search-form--compact'}`} onSubmit={onSubmit} role="search">
      <span className="search-leading" aria-hidden="true"><SearchIcon size={large ? 22 : 18} /></span>
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={large ? '输入一个英文单词…' : '查另一个单词'}
        aria-label="搜索英文单词"
        autoComplete="off"
        spellCheck="false"
      />
      {value && (
        <button
          className="search-clear"
          type="button"
          onClick={() => {
            onChange('')
            inputRef?.current?.focus()
          }}
          aria-label="清空搜索"
        >
          <CloseIcon size={14} />
        </button>
      )}
      <button
        className={`search-generate ${generateOpen ? 'search-generate--open' : ''}`}
        type="button"
        onClick={onGenerate}
        aria-expanded={generateOpen}
        aria-haspopup="dialog"
        title="打开释义速查悬浮窗"
      >
        <SparkIcon size={15} />
        <span className="generate-label">生成</span>
      </button>
      <button className="search-submit" type="submit" disabled={loading || !value.trim()}>
        {loading ? <span className="button-spinner" aria-hidden="true" /> : <span className="submit-label">查词</span>}
        <ArrowIcon size={15} />
      </button>
    </form>
  )
}

function ScenicBackground({ reading }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduceMotion || reading) return undefined
    const timer = window.setInterval(() => {
      setActive((value) => (value + 1) % SCENIC_PHOTOS.length)
    }, 11000)
    return () => window.clearInterval(timer)
  }, [reading])

  return (
    <div className={`scenic-backdrop ${reading ? 'scenic-backdrop--reading' : ''}`} aria-hidden="true">
      {SCENIC_PHOTOS.map((photo, index) => (
        <img
          key={photo.src}
          className={`scenic-photo ${index === active ? 'scenic-photo--active' : ''}`}
          src={photo.src}
          alt=""
          loading={index === 0 ? 'eager' : 'lazy'}
          fetchPriority={index === 0 ? 'high' : 'low'}
        />
      ))}
      <div className="scenic-wash" />
    </div>
  )
}

function SearchHistory({ recent, open, onLookup, onClear }) {
  if (!open) return null

  return (
    <div className="history-popover" role="dialog" aria-label="搜索历史">
      <div className="history-head">
        <div>
          <span className="history-kicker">最近查询</span>
          <strong>{recent.length}<span> / 100</span></strong>
        </div>
        {recent.length > 0 && (
          <button type="button" className="history-clear" onClick={onClear}>清空</button>
        )}
      </div>
      {recent.length > 0 ? (
        <ol className="history-list">
          {recent.map((word) => (
            <li key={word}>
              <button type="button" className="history-word" onClick={() => onLookup(word)}>
                <span>{word}</span>
                <ArrowIcon size={13} />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="history-empty">还没有查询记录。</p>
      )}
    </div>
  )
}

function Hero({ query, setQuery, onSubmit, onGenerate, loading, generateOpen, inputRef }) {
  return (
    <section className="hero" aria-label="词典搜索">
      <SearchForm
        value={query}
        onChange={setQuery}
        onSubmit={onSubmit}
        onGenerate={onGenerate}
        large
        loading={loading}
        generateOpen={generateOpen}
        inputRef={inputRef}
      />
    </section>
  )
}

function LoadingState({ word }) {
  return (
    <div className="loading-state" aria-live="polite">
      <div className="loading-heading">
        <span className="loading-rule" />
        <p>正在查询 <strong>{word}</strong></p>
      </div>
      <div className="skeleton skeleton-word" />
      <div className="skeleton-grid">
        <div>
          <div className="skeleton skeleton-line skeleton-line--long" />
          <div className="skeleton skeleton-line skeleton-line--medium" />
          <div className="skeleton skeleton-line skeleton-line--short" />
        </div>
        <div className="skeleton skeleton-block" />
      </div>
    </div>
  )
}

function ErrorState({ error, word, onLookup, onRetry }) {
  const phraseParts = word.split(/\s+/).filter(Boolean)
  return (
    <div className="error-state" role="alert">
      <div className="error-mark" aria-hidden="true"><RotateIcon size={22} /></div>
      {error.kind === 'phrase' ? (
        <>
          <h2>这是一个词组。</h2>
          <p>公开词典数据目前以单词词条为主。可以点击下面的单词继续查询：</p>
          <div className="chip-row error-chip-row">
            {phraseParts.map((part) => (
              <WordChip key={part} word={normalizeWord(part)} onLookup={onLookup} />
            ))}
          </div>
        </>
      ) : error.kind === 'network' ? (
        <>
          <h2>词典暂时没有回应。</h2>
          <p>{error.message}</p>
          <button type="button" className="retry-button" onClick={onRetry}>再试一次 <RotateIcon size={16} /></button>
        </>
      ) : (
        <>
          <h2>没有找到“{word}”的词条。</h2>
          <p>{error.message}</p>
          {error.suggestions?.length > 0 && (
            <>
              <p className="error-subhead">也许你想查：</p>
              <div className="chip-row error-chip-row">
                {error.suggestions.map((suggestion) => (
                  <WordChip key={suggestion} word={suggestion} onLookup={onLookup} />
                ))}
              </div>
            </>
          )}
          {(!error.suggestions || error.suggestions.length === 0) && (
            <p className="error-hint">换一种拼写，或者试试更短的单词。</p>
          )}
        </>
      )}
    </div>
  )
}

function WordChipList({ words, tone = 'default', onLookup, limit = 12 }) {
  const [expanded, setExpanded] = useState(false)
  if (!words?.length) return <span className="empty-inline">暂未收录</span>
  const visible = expanded ? words : words.slice(0, limit)
  return (
    <div className="chip-row">
      {visible.map((word) => (
        <WordChip key={word} word={word} tone={tone} onLookup={onLookup} />
      ))}
      {words.length > limit && (
        <button type="button" className="more-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起' : `展开其余 ${words.length - limit} 个`}
        </button>
      )}
    </div>
  )
}

function PhraseList({ phrases, onLookup, limit = 5 }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? phrases : phrases.slice(0, limit)

  return (
    <div className="phrase-list">
      {visible.map((phrase) => (
        <PhraseLine key={phrase} phrase={phrase} onLookup={onLookup} />
      ))}
      {phrases.length > limit && (
        <button type="button" className="more-button phrase-more" onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起' : `展开其余 ${phrases.length - limit} 个`}
        </button>
      )}
    </div>
  )
}

function ExampleLine({ text, id, onLookup, onSpeak, isSpeaking }) {
  return (
    <blockquote className="example">
      <QuoteIcon size={22} />
      <div className="example-copy">
        <p><WordLinkText text={text} onLookup={onLookup} /></p>
        <TranslatedText text={text} className="example-translation" />
      </div>
      <button
        type="button"
        className={`example-audio ${isSpeaking ? 'example-audio--playing' : ''}`}
        onClick={() => onSpeak(text, id)}
        aria-label={isSpeaking ? '停止例句朗读' : '朗读例句'}
        aria-pressed={isSpeaking}
        title={isSpeaking ? '停止朗读' : '朗读这条例句'}
      >
        <VolumeIcon size={14} />
        <span>{isSpeaking ? '停止' : '朗读'}</span>
      </button>
    </blockquote>
  )
}

function SenseRelations({ definition, synonyms, antonyms, onLookup }) {
  const directSynonyms = definition.synonyms || EMPTY_WORDS
  const directAntonyms = definition.antonyms || EMPTY_WORDS
  const [relations, setRelations] = useState({
    synonyms: directSynonyms,
    antonyms: directAntonyms,
  })

  useEffect(() => {
    let cancelled = false
    fetchSenseRelations(definition.definition, synonyms, antonyms).then((mapped) => {
      if (cancelled) return
      setRelations({
        synonyms: Array.from(new Set([...directSynonyms, ...mapped.synonyms])).slice(0, 8),
        antonyms: Array.from(new Set([...directAntonyms, ...mapped.antonyms])).slice(0, 6),
      })
    })
    return () => {
      cancelled = true
    }
  }, [definition, directAntonyms, directSynonyms, antonyms, synonyms])

  if (!relations.synonyms.length && !relations.antonyms.length) return null

  return (
    <div className="sense-relations">
      {relations.synonyms.length > 0 && (
        <div className="sense-relation-row">
          <span className="sense-relation-label">此义近义词</span>
          <WordChipList words={relations.synonyms} tone="synonym" onLookup={onLookup} limit={6} />
        </div>
      )}
      {relations.antonyms.length > 0 && (
        <div className="sense-relation-row">
          <span className="sense-relation-label">此义反义词</span>
          <WordChipList words={relations.antonyms} tone="antonym" onLookup={onLookup} limit={4} />
        </div>
      )}
    </div>
  )
}

function DefinitionList({
  definitions,
  onLookup,
  onSpeakExample,
  speakingExample,
  partOfSpeech,
  synonyms,
  antonyms,
}) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? definitions : definitions.slice(0, DEFINITION_PREVIEW_LIMIT)
  return (
    <>
      <ol className="definitions">
        {visible.map((item, index) => (
          <li className="definition" key={`${item.definition}-${index}`}>
            <span className="definition-number">{String(index + 1).padStart(2, '0')}</span>
            <div className="definition-body">
              <p className="definition-text">
                <WordLinkText text={item.definition} onLookup={onLookup} />
              </p>
              <TranslatedText text={item.definition} className="definition-translation" />
              {item.example && (
                <ExampleLine
                  text={item.example}
                  id={`example-${partOfSpeech}-${index}`}
                  onLookup={onLookup}
                  onSpeak={onSpeakExample}
                  isSpeaking={speakingExample === `example-${partOfSpeech}-${index}`}
                />
              )}
              <SenseRelations
                definition={item}
                synonyms={synonyms}
                antonyms={antonyms}
                onLookup={onLookup}
              />
            </div>
          </li>
        ))}
      </ol>
      {definitions.length > DEFINITION_PREVIEW_LIMIT && (
        <button type="button" className="more-definitions" onClick={() => setExpanded((value) => !value)}>
          {expanded ? '收起多余释义' : `展开其余 ${definitions.length - DEFINITION_PREVIEW_LIMIT} 条释义`}
        </button>
      )}
    </>
  )
}

function MeaningSection({ meaning, onLookup, onSpeakExample, speakingExample }) {
  return (
    <section className="meaning">
      <header className="meaning-head">
        <h3>{displayPartOfSpeech(meaning.partOfSpeech)}</h3>
        <span>{meaning.definitions.length} 条释义</span>
      </header>
      <DefinitionList
        definitions={meaning.definitions}
        onLookup={onLookup}
        onSpeakExample={onSpeakExample}
        speakingExample={speakingExample}
        partOfSpeech={meaning.partOfSpeech}
        synonyms={meaning.synonyms}
        antonyms={meaning.antonyms}
      />
      {!meaning.definitions.some((item) => item.example) && (
        <p className="example-note">公开词典数据暂未收录这一词性的例句。</p>
      )}
    </section>
  )
}

function AsideSection({ title, count, children }) {
  return (
    <section className="aside-section">
      <div className="aside-heading">
        <h3>{title}</h3>
        {typeof count === 'number' && <span>{count}</span>}
      </div>
      {children}
    </section>
  )
}

function EntryView({ data, activePos, setActivePos, onLookup }) {
  const { entry, extras } = data
  const [isPlaying, setIsPlaying] = useState(false)
  const [speakingExample, setSpeakingExample] = useState(null)
  const audioRef = useRef(null)
  const speechTokenRef = useRef(0)

  const meanings = useMemo(() => (
    activePos === 'all'
      ? entry.meanings
      : entry.meanings.filter((meaning) => meaning.partOfSpeech === activePos)
  ), [activePos, entry.meanings])

  const speakWithSystemVoice = useCallback(() => {
    const token = ++speechTokenRef.current
    setSpeakingExample(null)
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') {
      setIsPlaying(false)
      return
    }
    window.speechSynthesis.cancel()
    const utterance = new window.SpeechSynthesisUtterance(entry.word)
    utterance.lang = 'en-US'
    utterance.rate = 0.9
    utterance.pitch = 1
    const voice = getPreferredAmericanVoice()
    if (voice) utterance.voice = voice
    utterance.onstart = () => {
      if (token === speechTokenRef.current) setIsPlaying(true)
    }
    utterance.onend = () => {
      if (token === speechTokenRef.current) setIsPlaying(false)
    }
    utterance.onerror = () => {
      if (token === speechTokenRef.current) setIsPlaying(false)
    }
    window.speechSynthesis.speak(utterance)
  }, [entry.word])

  const playPronunciation = useCallback(() => {
    window.speechSynthesis?.cancel()
    audioRef.current?.pause()
    setSpeakingExample(null)
    if (window.speechSynthesis && typeof window.SpeechSynthesisUtterance !== 'undefined') {
      speakWithSystemVoice()
      return
    }
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = 0
    const playback = audio.play()
    if (playback?.then) {
      playback
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false))
    }
  }, [speakWithSystemVoice])

  const speakExample = useCallback((text, id) => {
    if (!text) return
    const token = ++speechTokenRef.current
    window.speechSynthesis?.cancel()
    audioRef.current?.pause()
    setIsPlaying(false)

    if (speakingExample === id) {
      setSpeakingExample(null)
      return
    }

    setSpeakingExample(null)
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') return

    const utterance = new window.SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 0.92
    utterance.pitch = 1
    const voice = getPreferredAmericanVoice()
    if (voice) utterance.voice = voice
    utterance.onstart = () => {
      if (token === speechTokenRef.current) setSpeakingExample(id)
    }
    utterance.onend = () => {
      if (token === speechTokenRef.current) setSpeakingExample(null)
    }
    utterance.onerror = () => {
      if (token === speechTokenRef.current) setSpeakingExample(null)
    }
    window.speechSynthesis.speak(utterance)
  }, [speakingExample])

  useEffect(() => {
    setIsPlaying(false)
    const timer = window.setTimeout(playPronunciation, 320)
    return () => {
      window.clearTimeout(timer)
      audioRef.current?.pause()
      speechTokenRef.current += 1
      window.speechSynthesis?.cancel()
    }
  }, [playPronunciation])

  return (
    <article className="entry">
      {entry.audio && (
        <audio
          ref={audioRef}
          src={entry.audio}
          onEnded={() => setIsPlaying(false)}
          onError={() => setIsPlaying(false)}
          preload="none"
        />
      )}
      <header className="entry-head">
        <div className="entry-title-block">
          <h2 className="entry-word">{entry.word}</h2>
          <div className="entry-meta">
            <span className="phonetic">{entry.phonetic}</span>
            <button
              type="button"
              className={`audio-button ${isPlaying ? 'audio-button--playing' : ''}`}
              onClick={playPronunciation}
              aria-label="播放美式发音"
            >
              <VolumeIcon size={17} />
              <span>{isPlaying ? '正在播放' : '美音'}</span>
            </button>
            <span className="meta-dot" aria-hidden="true">·</span>
            <span>{entry.meanings.length} 个词性</span>
            <span className="meta-dot" aria-hidden="true">·</span>
            <span>{entry.totalDefinitions} 条释义</span>
          </div>
        </div>
        <p className="entry-follow-note"><span className="follow-line" /> 点击任意单词继续查询。</p>
      </header>

      <nav className="pos-tabs" aria-label="按词性筛选释义">
        <button type="button" className={activePos === 'all' ? 'active' : ''} onClick={() => setActivePos('all')}>
          全部 <span>{entry.totalDefinitions}</span>
        </button>
        {entry.meanings.map((meaning) => (
          <button
            key={meaning.partOfSpeech}
            type="button"
            className={activePos === meaning.partOfSpeech ? 'active' : ''}
            onClick={() => setActivePos(meaning.partOfSpeech)}
          >
            {displayPartOfSpeech(meaning.partOfSpeech)} <span>{meaning.definitions.length}</span>
          </button>
        ))}
      </nav>

      <div className="entry-grid">
        <div className="entry-main">
          {meanings.map((meaning) => (
            <MeaningSection
              key={meaning.partOfSpeech}
              meaning={meaning}
              onLookup={onLookup}
              onSpeakExample={speakExample}
              speakingExample={speakingExample}
            />
          ))}
        </div>

        <aside className="entry-aside" aria-label="词条详情">
          {extras.variants.length > 0 && (
            <AsideSection title="词形与词族" count={extras.variants.length}>
              <div className="word-grid">
                {extras.variants.map((word) => (
                  <WordChip
                    key={word}
                    word={word}
                    label={variantLabel(word)}
                    onLookup={onLookup}
                  />
                ))}
              </div>
            </AsideSection>
          )}

          {extras.phrases.length > 0 && (
            <AsideSection title="词组与搭配" count={extras.phrases.length}>
              <PhraseList phrases={extras.phrases} onLookup={onLookup} />
            </AsideSection>
          )}

          {extras.related.length > 0 && (
            <AsideSection title="相关词" count={extras.related.length}>
              <div className="chip-row">
                {extras.related.map((word) => (
                  <WordChip key={word} word={word} onLookup={onLookup} />
                ))}
              </div>
            </AsideSection>
          )}

          {extras.variants.length === 0 && extras.phrases.length === 0 && extras.related.length === 0 && (
            <AsideSection title="补充信息">
              <p className="aside-empty">公开数据暂未收录派生词形、词组或相关词。</p>
            </AsideSection>
          )}

          <AsideSection title="数据来源">
            <p className="source-copy">
              {entry.source === 'merriam-webster'
                ? `释义/例句：${entry.sourceName.replace("Merriam-Webster's ", 'M-W ').replace(' Dictionary', '')}。相关词：Datamuse。中文机译：MyMemory。`
                : '释义/例句：Wiktionary。相关词：Datamuse。中文机译：MyMemory。'}
            </p>
            {(entry.sourceUrl || entry.sourceUrls?.[0]) && (
              <a className="source-link" href={entry.sourceUrl || entry.sourceUrls[0]} target="_blank" rel="noreferrer">
                查看 {entry.source === 'merriam-webster' ? 'Merriam-Webster' : 'Wiktionary'} 词条 <ExternalIcon size={13} />
              </a>
            )}
          </AsideSection>
        </aside>
      </div>
    </article>
  )
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>Lexicon · 私人英语词典。释义与例句来自 Merriam-Webster 或 Wiktionary，相关词来自 Datamuse。</p>
      <div className="footer-links">
        <a href="https://dictionaryapi.com/" target="_blank" rel="noreferrer">Merriam-Webster <ExternalIcon size={12} /></a>
        <a href="https://en.wiktionary.org/" target="_blank" rel="noreferrer">Wiktionary <ExternalIcon size={12} /></a>
        <a href="https://www.datamuse.com/api/" target="_blank" rel="noreferrer">Datamuse <ExternalIcon size={12} /></a>
        <a href="https://unsplash.com/" target="_blank" rel="noreferrer">风景照片 Unsplash <ExternalIcon size={12} /></a>
      </div>
    </footer>
  )
}

export default function App() {
  const [query, setQuery] = useState('')
  const [searchedWord, setSearchedWord] = useState('')
  const [status, setStatus] = useState('idle')
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [recent, setRecent] = useState(() => getRecentSearches())
  const [activePos, setActivePos] = useState('all')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [floatingOpen, setFloatingOpen] = useState(false)
  const requestId = useRef(0)
  const resultRef = useRef(null)
  const searchInputRef = useRef(null)
  const historyRef = useRef(null)

  const performSearch = useCallback(async (rawWord, options = {}) => {
    const word = normalizeWord(rawWord)
    if (!word) return

    const { pushHistory = true, scroll = true } = options
    setQuery(word)
    setSearchedWord(word)
    setActivePos('all')
    setError(null)
    setData(null)
    setStatus('loading')

    if (pushHistory) {
      window.history.pushState({ word }, '', `?q=${encodeURIComponent(word)}`)
    }
    if (scroll) {
      window.setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
    }

    if (!isSingleWord(word)) {
      const suggestions = word.split(/\s+/).filter(Boolean).slice(0, 8)
      setError({
        kind: 'phrase',
        message: '这个词组无法作为整体查询。',
        suggestions,
      })
      setStatus('error')
      document.title = '词组查询｜Lexicon'
      return
    }

    const currentRequest = ++requestId.current
    try {
      const result = await fetchWordData(word)
      if (currentRequest !== requestId.current) return
      setData(result)
      setStatus('success')
      setRecent(addRecentSearch(word))
      document.title = `${result.entry.word}｜Lexicon`
    } catch (caught) {
      if (currentRequest !== requestId.current) return
      if (caught instanceof DictionaryNotFoundError) {
        const suggestions = await fetchSuggestions(word)
        if (currentRequest !== requestId.current) return
        setError({
          kind: 'not-found',
          message: '可能是拼写有误，或者词典尚未收录这个词。',
          suggestions,
        })
      } else {
        setError({
          kind: 'network',
          message: '请检查网络连接后再试。最近查过的词仍然可用。',
          suggestions: [],
        })
      }
      setStatus('error')
      document.title = `未找到 ${word}｜Lexicon`
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initialWord = params.get('q')
    if (initialWord) performSearch(initialWord, { pushHistory: false, scroll: false })

    const handlePopState = () => {
      setFloatingOpen(false)
      const nextWord = new URLSearchParams(window.location.search).get('q')
      if (nextWord) {
        performSearch(nextWord, { pushHistory: false, scroll: false })
      } else {
        requestId.current += 1
        setStatus('idle')
        setData(null)
        setError(null)
        setQuery('')
        document.title = 'Lexicon｜私人英语词典'
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [performSearch])

  useEffect(() => {
    const desktop = window.desktopApp
    if (!desktop?.onLookupWord) return undefined
    return desktop.onLookupWord((word) => {
      if (!word) return
      setHistoryOpen(false)
      setFloatingOpen(false)
      performSearch(word)
    })
  }, [performSearch])

  useEffect(() => {
    if (!historyOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!historyRef.current?.contains(event.target)) setHistoryOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setHistoryOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [historyOpen])

  const handleSubmit = (event) => {
    event.preventDefault()
    setFloatingOpen(false)
    performSearch(query)
  }

  const handleLookup = (word) => {
    setHistoryOpen(false)
    setFloatingOpen(false)
    performSearch(word)
  }

  const handleGenerate = () => {
    setHistoryOpen(false)
    if (window.desktopApp?.openFloatingLookup) {
      setFloatingOpen(false)
      void window.desktopApp.openFloatingLookup(query)
      return
    }
    setFloatingOpen(true)
  }

  const handleOpenMain = (word) => {
    setFloatingOpen(false)
    performSearch(word)
  }

  const handleHome = (event) => {
    event.preventDefault()
    requestId.current += 1
    window.history.pushState({}, '', window.location.pathname)
    setStatus('idle')
    setData(null)
    setError(null)
    setQuery('')
    setActivePos('all')
    setHistoryOpen(false)
    setFloatingOpen(false)
    document.title = 'Lexicon｜私人英语词典'
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.setTimeout(() => searchInputRef.current?.focus(), 180)
  }

  const handleClearRecent = () => {
    setRecent(clearRecentSearches())
  }

  const isLoading = status === 'loading'
  const isReading = status !== 'idle'

  return (
    <div className={`app-shell ${isReading ? 'app-shell--reading' : ''}`}>
      <ScenicBackground reading={isReading} />
      <header className="site-header">
        <a className="brand" href="/" onClick={handleHome}>
          <span className="brand-mark" aria-hidden="true">L</span>
          <span className="brand-copy">
            <span className="brand-name">Lexicon</span>
            <span className="brand-sub">私人英语词典</span>
          </span>
        </a>
        <div className="header-actions" ref={historyRef}>
          <button
            type="button"
            className={`history-trigger ${historyOpen ? 'history-trigger--open' : ''}`}
            onClick={() => setHistoryOpen((value) => !value)}
            aria-expanded={historyOpen}
            aria-haspopup="dialog"
          >
            <HistoryIcon size={16} />
            <span>历史</span>
            {recent.length > 0 && <b>{recent.length}</b>}
          </button>
          <SearchHistory
            recent={recent}
            open={historyOpen}
            onLookup={handleLookup}
            onClear={handleClearRecent}
          />
        </div>
      </header>

      <main className="app-body">
        {status === 'idle' ? (
          <Hero
            query={query}
            setQuery={setQuery}
            onSubmit={handleSubmit}
            onGenerate={handleGenerate}
            loading={isLoading}
            generateOpen={floatingOpen}
            inputRef={searchInputRef}
          />
        ) : (
          <div className="lookup-toolbar">
            <SearchForm
              value={query}
              onChange={setQuery}
              onSubmit={handleSubmit}
              onGenerate={handleGenerate}
              loading={isLoading}
              generateOpen={floatingOpen}
              inputRef={searchInputRef}
            />
            <p className="toolbar-note">进入词条自动播放美音 · 可按词性筛选</p>
          </div>
        )}

        <section
          className="result-stage"
          ref={resultRef}
          aria-live="polite"
          aria-busy={isLoading}
        >
          {status === 'loading' && <LoadingState word={searchedWord} />}
          {status === 'error' && error && (
            <ErrorState
              error={error}
              word={searchedWord}
              onLookup={handleLookup}
              onRetry={() => performSearch(searchedWord, { scroll: false })}
            />
          )}
          {status === 'success' && data && (
            <EntryView
              data={data}
              activePos={activePos}
              setActivePos={setActivePos}
              onLookup={handleLookup}
            />
          )}
        </section>
      </main>

      {floatingOpen && (
        <FloatingLookup
          initialQuery={query}
          onClose={() => setFloatingOpen(false)}
          onOpenMain={handleOpenMain}
        />
      )}

      {isReading && <SiteFooter />}
    </div>
  )
}

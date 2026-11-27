import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addRecentSearch,
  clearRecentSearches,
  DictionaryNotFoundError,
  fetchSenseRelations,
  fetchWordData,
  getRecentSearches,
  lookupWord,
} from './lib/dictionary'
import {
  isSingleWord,
  normalizeWord,
  variantLabel,
} from './lib/text'
import { displayPartOfSpeech } from './lib/pos'
import { getPreferredVoice, accentLang } from './lib/speech'
import {
  advanceBackgroundPlayback,
  ALL_BACKGROUND_IDS,
  createBackgroundPlayback,
  getSelectedBackgroundIds,
  photosForIds,
  saveSelectedBackgroundIds,
  SCENIC_PHOTOS,
} from './lib/backgrounds'
import {
  emitBackgroundsChanged,
  emitHistoryAdded,
  emitHistoryCleared,
} from './lib/account'
import { useAccount } from './lib/useAccount'
import { getSuggestions, rankLocalSuggestions } from './lib/suggest'
import { warmUpWordList } from './lib/wordlist'
import { getFavorites, isFavorite as isWordFavorite, removeFavorite, toggleFavorite } from './lib/favorites'
import { ACCENT_OPTIONS, getPreferences, savePreferences } from './lib/preferences'
import {
  ArrowIcon,
  CheckIcon,
  CloseIcon,
  ExternalIcon,
  HistoryIcon,
  QuoteIcon,
  RotateIcon,
  SearchIcon,
  SettingsIcon,
  SparkIcon,
  StarIcon,
  VolumeIcon,
} from './components/Icons'
import { AccountMenu } from './components/AccountMenu'
import { FloatingLookup } from './components/FloatingLookup'
import { TranslatedText } from './components/TranslatedText'
import { PhraseLine, WordChip, WordLinkText } from './components/WordText'

const DEFINITION_PREVIEW_LIMIT = 2
const EMPTY_WORDS = []

function SearchForm({
  value,
  onChange,
  onSubmit,
  onGenerate,
  onSelect,
  large = false,
  loading = false,
  generateOpen = false,
  inputRef,
}) {
  const [suggestions, setSuggestions] = useState([])
  const [highlight, setHighlight] = useState(-1)
  const [focused, setFocused] = useState(false)
  const typed = value.trim()
  const open = focused && !loading && suggestions.length > 0

  useEffect(() => {
    if (!focused || !typed) {
      setSuggestions([])
      setHighlight(-1)
      return undefined
    }

    let active = true
    // 本地历史和缓存先给出一版结果，词表加载完后再替换，输入时不会一直空着。
    setSuggestions(rankLocalSuggestions(typed))
    setHighlight(-1)

    const timer = window.setTimeout(async () => {
      const ranked = await getSuggestions(typed)
      if (!active) return
      if (ranked.length) setSuggestions(ranked)
    }, 80)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [typed, focused])

  const chooseSuggestion = (word) => {
    setSuggestions([])
    setHighlight(-1)
    setFocused(false)
    inputRef?.current?.blur()
    if (onSelect) onSelect(word)
    else onChange(word)
  }

  const handleKeyDown = (event) => {
    if (!open) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((index) => (index + 1) % suggestions.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((index) => (index <= 0 ? suggestions.length - 1 : index - 1))
      return
    }
    if (event.key === 'Escape') {
      setSuggestions([])
      setHighlight(-1)
      return
    }
    if (event.key === 'Enter' && highlight >= 0) {
      event.preventDefault()
      chooseSuggestion(suggestions[highlight].word)
    }
  }

  return (
    <form className={`search-form ${large ? 'search-form--large' : 'search-form--compact'}`} onSubmit={onSubmit} role="search">
      <span className="search-leading" aria-hidden="true"><SearchIcon size={large ? 22 : 18} /></span>
      <div className="search-field">
        <input
          ref={inputRef}
          className="search-input"
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={large ? '输入一个英文单词…' : '查另一个单词'}
          aria-label="搜索英文单词"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? 'search-suggestions' : undefined}
          aria-activedescendant={highlight >= 0 ? `search-suggestion-${highlight}` : undefined}
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
      </div>
      {open && (
        <ul
          className="search-suggest"
          id="search-suggestions"
          role="listbox"
          aria-label="拼写建议"
          onMouseDown={(event) => event.preventDefault()}
        >
          {suggestions.map((item, index) => (
            <li
              key={item.word}
              id={`search-suggestion-${index}`}
              role="option"
              aria-selected={index === highlight}
              className={`search-suggest-item ${index === highlight ? 'search-suggest-item--active' : ''}`}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => chooseSuggestion(item.word)}
            >
              <span className="search-suggest-word">{item.word}</span>
            </li>
          ))}
        </ul>
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

function ScenicBackground({ reading, photos }) {
  const [playback, setPlayback] = useState(() => createBackgroundPlayback(photos))

  const current = playback.order[playback.cursor] ?? photos[0]
  const previous = playback.previousId
    ? photos.find((photo) => photo.id === playback.previousId) ?? null
    : null

  useEffect(() => {
    if (photos.length < 2 || reading) return undefined
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const timer = window.setInterval(() => {
      setPlayback((value) => advanceBackgroundPlayback(value, photos))
    }, 11000)
    return () => window.clearInterval(timer)
  }, [photos, reading])

  useEffect(() => {
    const next = playback.order[(playback.cursor + 1) % playback.order.length]
    if (!next?.src) return undefined
    const image = new Image()
    image.src = next.src
    return undefined
  }, [playback])

  return (
    <div className={`scenic-backdrop ${reading ? 'scenic-backdrop--reading' : ''}`} aria-hidden="true">
      {previous && (
        <img
          key={`previous-${previous.id}`}
          className="scenic-photo scenic-photo--previous"
          src={previous.src}
          alt=""
        />
      )}
      {current && (
        <img
          key={`current-${current.id}`}
          className="scenic-photo scenic-photo--active"
          src={current.src}
          alt=""
          fetchPriority="high"
        />
      )}
      <div className="scenic-wash" />
    </div>
  )
}

const SETTINGS_TABS = [
  { id: 'backgrounds', label: '背景图片' },
  { id: 'favorites', label: '收藏单词' },
  { id: 'preferences', label: '使用偏好' },
]

function SettingsPanel({
  tab,
  onTabChange,
  selectedIds,
  notice,
  onToggle,
  onSelectAll,
  favorites,
  onOpenFavorite,
  onRemoveFavorite,
  accent,
  onAccentChange,
  onClose,
}) {
  const allSelected = selectedIds.length === SCENIC_PHOTOS.length
  const currentTab = SETTINGS_TABS.find((item) => item.id === tab) || SETTINGS_TABS[0]

  return (
    <div className="settings-panel" role="dialog" aria-label="设置">
      <div className="settings-head">
        <div>
          <span className="settings-kicker">设置</span>
          <strong>{currentTab.label}</strong>
        </div>
        <button type="button" className="settings-close" onClick={onClose} aria-label="关闭设置">
          <CloseIcon size={14} />
        </button>
      </div>

      <div className="settings-tabs" role="tablist" aria-label="设置分类">
        {SETTINGS_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={`settings-tab ${tab === item.id ? 'settings-tab--active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
            {item.id === 'favorites' && favorites.length > 0 && <b>{favorites.length}</b>}
          </button>
        ))}
      </div>

      {tab === 'backgrounds' && (
        <div className="settings-section">
          <div className="settings-section-head">
            <p>勾选喜欢的风景图片，背景会在已选图片中自动轮播。</p>
            <button
              type="button"
              className="settings-select-all"
              onClick={onSelectAll}
              disabled={allSelected}
            >
              {allSelected ? '已全选' : '全选'}
            </button>
          </div>
          <div className="background-grid">
            {SCENIC_PHOTOS.map((photo) => {
              const checked = selectedIds.includes(photo.id)
              return (
                <label key={photo.id} className={`background-option ${checked ? 'background-option--checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(photo.id)}
                    aria-label={photo.label}
                  />
                  <img src={photo.src} alt="" loading="lazy" decoding="async" />
                  <span className="background-label">{photo.label}</span>
                  <span className="background-check" aria-hidden="true">
                    {checked && <CheckIcon size={12} />}
                  </span>
                </label>
              )
            })}
          </div>
          <div className="settings-footer" aria-live="polite">
            <span>已选 {selectedIds.length} / {SCENIC_PHOTOS.length} 张</span>
            {notice && <span className="settings-notice" role="status">{notice}</span>}
          </div>
        </div>
      )}

      {tab === 'favorites' && (
        <div className="settings-section">
          <div className="settings-section-head">
            <p>查词时点击单词旁的小星星即可收藏；点击下面的单词直接查询。</p>
          </div>
          {favorites.length === 0 ? (
            <p className="settings-empty">还没有收藏的单词。</p>
          ) : (
            <ul className="favorite-list">
              {favorites.map((item) => (
                <li key={item.word} className="favorite-item">
                  <button
                    type="button"
                    className="favorite-word"
                    onClick={() => onOpenFavorite(item.word)}
                    title={`查询“${item.word}”`}
                  >
                    {item.word}
                  </button>
                  <button
                    type="button"
                    className="favorite-remove"
                    onClick={() => onRemoveFavorite(item.word)}
                    aria-label={`取消收藏 ${item.word}`}
                    title="取消收藏"
                  >
                    <StarIcon size={14} filled />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'preferences' && (
        <div className="settings-section">
          <div className="settings-section-head">
            <p>发音偏好决定查词时自动朗读、以及例句朗读使用的口音。</p>
          </div>
          <div className="accent-options" role="radiogroup" aria-label="发音偏好">
            {ACCENT_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={accent === option.id}
                className={`accent-option ${accent === option.id ? 'accent-option--active' : ''}`}
                onClick={() => onAccentChange(option.id)}
              >
                <span>{option.label}</span>
                <small>{option.hint}</small>
              </button>
            ))}
          </div>
          <p className="settings-hint">
            英音使用系统语音合成；词典自带的发音录音仍是美式。系统没有装英音语音时会自动回退。
          </p>
        </div>
      )}
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

function Hero({ query, setQuery, onSubmit, onSelect, onGenerate, loading, generateOpen, inputRef }) {
  return (
    <section className="hero" aria-label="词典搜索">
      <SearchForm
        value={query}
        onChange={setQuery}
        onSubmit={onSubmit}
        onSelect={onSelect}
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

function EntryView({ data, activePos, setActivePos, onLookup, favorite, onToggleFavorite, accent = 'us' }) {
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
    utterance.lang = accentLang(accent)
    utterance.rate = 0.9
    utterance.pitch = 1
    const voice = getPreferredVoice(accent)
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
  }, [entry.word, accent])

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
    utterance.lang = accentLang(accent)
    utterance.rate = 0.92
    utterance.pitch = 1
    const voice = getPreferredVoice(accent)
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
  }, [speakingExample, accent])

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
          <div className="entry-word-row">
            <h2 className="entry-word">{entry.word}</h2>
            <button
              type="button"
              className={`favorite-button ${favorite ? 'favorite-button--active' : ''}`}
              onClick={onToggleFavorite}
              aria-pressed={favorite}
              aria-label={favorite ? '取消收藏这个单词' : '收藏这个单词'}
              title={favorite ? '取消收藏' : '收藏这个单词'}
            >
              <StarIcon size={19} filled={favorite} />
            </button>
          </div>
          <div className="entry-meta">
            <span className="phonetic">{entry.phonetic}</span>
            <button
              type="button"
              className={`audio-button ${isPlaying ? 'audio-button--playing' : ''}`}
              onClick={playPronunciation}
              aria-label={accent === 'uk' ? '播放英式发音' : '播放美式发音'}
            >
              <VolumeIcon size={17} />
              <span>{isPlaying ? '正在播放' : accent === 'uk' ? '英音' : '美音'}</span>
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
  const [redirect, setRedirect] = useState(null)
  const [recent, setRecent] = useState(() => getRecentSearches())
  const [activePos, setActivePos] = useState('all')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState('backgrounds')
  const [selectedBackgroundIds, setSelectedBackgroundIds] = useState(() => getSelectedBackgroundIds())
  const [settingsNotice, setSettingsNotice] = useState('')
  const [favorites, setFavorites] = useState(() => getFavorites())
  const [preferences, setPreferences] = useState(() => getPreferences())
  const [floatingOpen, setFloatingOpen] = useState(false)
  const requestId = useRef(0)
  const resultRef = useRef(null)
  const searchInputRef = useRef(null)
  const historyRef = useRef(null)
  const settingsRef = useRef(null)
  const selectedBackgrounds = useMemo(
    () => photosForIds(selectedBackgroundIds),
    [selectedBackgroundIds],
  )
  const account = useAccount({
    onHistoryMerged: (words) => setRecent(words),
    onBackgroundsMerged: (ids) => setSelectedBackgroundIds(ids),
    onFavoritesMerged: (items) => setFavorites(items),
  })

  // 提前加载拼写建议用的常用词表，输入时就不用等文件请求。
  useEffect(() => {
    warmUpWordList()
  }, [])

  const performSearch = useCallback(async (rawWord, options = {}) => {
    const word = normalizeWord(rawWord)
    if (!word) return

    const { pushHistory = true, scroll = true, allowRedirect = true } = options
    setQuery(word)
    setSearchedWord(word)
    setActivePos('all')
    setError(null)
    setRedirect(null)
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
      const loaded = allowRedirect
        ? await lookupWord(word)
        : { data: await fetchWordData(word, { skipMerriam: true }), redirectFrom: null }
      if (currentRequest !== requestId.current) return
      const result = loaded.data
      const targetWord = result.entry.word
      setData(result)
      setStatus('success')
      setRecent(addRecentSearch(targetWord))
      emitHistoryAdded(targetWord)
      document.title = `${targetWord}｜Lexicon`

      if (loaded.redirectFrom) {
        // 变形词自动跳转到原形：同步输入框、标题和地址栏。
        // 用 replaceState，避免“went → go”在历史记录里留下两条。
        setRedirect({ from: loaded.redirectFrom, to: targetWord })
        setQuery(targetWord)
        setSearchedWord(targetWord)
        window.history.replaceState({ word: targetWord }, '', `?q=${encodeURIComponent(targetWord)}`)
      }
    } catch (caught) {
      if (currentRequest !== requestId.current) return
      if (caught instanceof DictionaryNotFoundError) {
        const ranked = await getSuggestions(word)
        if (currentRequest !== requestId.current) return
        setError({
          kind: 'not-found',
          message: '可能是拼写有误，或者词典尚未收录这个词。',
          suggestions: ranked.map((item) => item.word),
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

  useEffect(() => {
    if (!settingsOpen) return undefined
    const closeOnOutsideClick = (event) => {
      if (!settingsRef.current?.contains(event.target)) setSettingsOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setSettingsOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [settingsOpen])

  const handleToggleBackground = (photoId) => {
    const isSelected = selectedBackgroundIds.includes(photoId)
    if (isSelected && selectedBackgroundIds.length === 1) {
      setSettingsNotice('至少保留一张背景图片')
      return
    }
    const next = isSelected
      ? selectedBackgroundIds.filter((id) => id !== photoId)
      : [...selectedBackgroundIds, photoId]
    setSelectedBackgroundIds(saveSelectedBackgroundIds(next))
    emitBackgroundsChanged()
    setSettingsNotice('')
  }

  const handleSelectAllBackgrounds = () => {
    setSelectedBackgroundIds(saveSelectedBackgroundIds(ALL_BACKGROUND_IDS))
    emitBackgroundsChanged()
    setSettingsNotice('')
  }

  const handleToggleFavorite = useCallback((word) => {
    if (!word) return
    setFavorites(toggleFavorite(word))
  }, [])

  const handleRemoveFavorite = useCallback((word) => {
    setFavorites(removeFavorite(word))
  }, [])

  const handleOpenFavorite = useCallback((word) => {
    setSettingsOpen(false)
    setHistoryOpen(false)
    performSearch(word)
  }, [performSearch])

  const handleAccentChange = useCallback((accent) => {
    setPreferences(savePreferences({ accent }))
  }, [])

  const handleSubmit = (event) => {
    event.preventDefault()
    setSettingsOpen(false)
    setFloatingOpen(false)
    performSearch(query)
  }

  const handleLookup = (word) => {
    setHistoryOpen(false)
    setSettingsOpen(false)
    setFloatingOpen(false)
    performSearch(word)
  }

  const handleGenerate = () => {
    setHistoryOpen(false)
    setSettingsOpen(false)
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
    setSettingsOpen(false)
    setFloatingOpen(false)
    document.title = 'Lexicon｜私人英语词典'
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.setTimeout(() => searchInputRef.current?.focus(), 180)
  }

  const handleClearRecent = () => {
    setRecent(clearRecentSearches())
    emitHistoryCleared()
  }

  const isLoading = status === 'loading'
  const isReading = status !== 'idle'

  return (
    <div className={`app-shell ${isReading ? 'app-shell--reading' : ''}`}>
      <ScenicBackground
        key={selectedBackgrounds.map((photo) => photo.id).join('|')}
        reading={isReading}
        photos={selectedBackgrounds}
      />
      <header className="site-header">
        <div className="brand-area" ref={settingsRef}>
          <a className="brand" href="/" onClick={handleHome}>
            <span className="brand-mark" aria-hidden="true">L</span>
            <span className="brand-copy">
              <span className="brand-name">Lexicon</span>
              <span className="brand-sub">私人英语词典</span>
            </span>
          </a>
          <button
            type="button"
            className={`appearance-toggle ${settingsOpen ? 'appearance-toggle--open' : ''}`}
            onClick={() => {
              setHistoryOpen(false)
              setSettingsNotice('')
              setSettingsOpen((value) => !value)
            }}
            aria-expanded={settingsOpen}
            aria-haspopup="dialog"
            aria-label="设置"
            title="背景图片、收藏单词与发音偏好"
          >
            <SettingsIcon size={16} />
          </button>
          {settingsOpen && (
            <SettingsPanel
              tab={settingsTab}
              onTabChange={setSettingsTab}
              selectedIds={selectedBackgroundIds}
              notice={settingsNotice}
              onToggle={handleToggleBackground}
              onSelectAll={handleSelectAllBackgrounds}
              favorites={favorites}
              onOpenFavorite={handleOpenFavorite}
              onRemoveFavorite={handleRemoveFavorite}
              accent={preferences.accent}
              onAccentChange={handleAccentChange}
              onClose={() => setSettingsOpen(false)}
            />
          )}
        </div>
        <div className="header-actions">
          <AccountMenu account={account} />
          <div className="history-area" ref={historyRef}>
            <button
              type="button"
              className={`history-trigger ${historyOpen ? 'history-trigger--open' : ''}`}
              onClick={() => {
                setSettingsOpen(false)
                setHistoryOpen((value) => !value)
              }}
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
        </div>
      </header>

      <main className="app-body">
        {status === 'idle' ? (
          <Hero
            query={query}
            setQuery={setQuery}
            onSubmit={handleSubmit}
            onSelect={handleLookup}
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
              onSelect={handleLookup}
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
          {status === 'success' && data && redirect && (
            <div className="redirect-note" role="status">
              <span className="redirect-badge">词形</span>
              <p>
                「<strong>{redirect.from}</strong>」是「<strong>{redirect.to}</strong>」的变形，已自动跳转到原形。
                <button
                  type="button"
                  className="redirect-link"
                  onClick={() => performSearch(redirect.from, { allowRedirect: false })}
                >
                  查看 {redirect.from} 词条
                </button>
              </p>
            </div>
          )}
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
              favorite={isWordFavorite(data.entry.word)}
              onToggleFavorite={() => handleToggleFavorite(data.entry.word)}
              accent={preferences.accent}
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

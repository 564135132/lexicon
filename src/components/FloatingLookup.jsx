import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DictionaryNotFoundError, fetchSuggestions, fetchWordData } from '../lib/dictionary'
import { extractLookupWords, getLookupWord } from '../lib/text'
import { recognizeEnglishImage } from '../lib/ocr'
import { getPreferredAmericanVoice } from '../lib/speech'
import { displayPartOfSpeech } from '../lib/pos'
import { BackIcon, CaptureIcon, CloseIcon, ImageIcon, PinIcon, SearchIcon, SparkIcon, VolumeIcon } from './Icons'
import { TranslatedText } from './TranslatedText'

function copyStylesToPipWindow(pipWindow) {
  const pipDocument = pipWindow.document
  const charset = pipDocument.createElement('meta')
  charset.setAttribute('charset', 'UTF-8')
  pipDocument.head.appendChild(charset)

  const base = pipDocument.createElement('base')
  base.href = document.baseURI
  pipDocument.head.appendChild(base)

  document.querySelectorAll('link[rel="stylesheet"], style').forEach((element) => {
    pipDocument.head.appendChild(element.cloneNode(true))
  })

  pipDocument.title = 'Lexicon · 释义速查'
  pipDocument.documentElement.lang = 'zh-CN'
  pipDocument.body.classList.add('pip-window')
}

export function FloatingLookup({
  initialQuery = '',
  onClose,
  onOpenMain,
  desktopWindow = false,
  nativePinned = false,
  onToggleNativePin,
}) {
  const initialText = initialQuery.trim()
  const isNativeWindow = typeof onToggleNativePin === 'function'
  const [text, setText] = useState(initialText)
  const [entry, setEntry] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [imagePreview, setImagePreview] = useState('')
  const [ocrMessage, setOcrMessage] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [pipWindow, setPipWindow] = useState(null)
  const [pinMessage, setPinMessage] = useState('')
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const requestRef = useRef(0)
  const speechTokenRef = useRef(0)
  const imageUrlRef = useRef('')
  const pipWindowRef = useRef(null)

  const stopSpeech = useCallback(() => {
    speechTokenRef.current += 1
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
  }, [])

  const lookupWord = useCallback(async (rawText) => {
    const word = getLookupWord(rawText)
    if (!word) {
      setStatus('idle')
      setEntry(null)
      setError('')
      return
    }

    const request = ++requestRef.current
    stopSpeech()
    setStatus('loading')
    setEntry(null)
    setError('')
    setSuggestions([])

    try {
      const result = await fetchWordData(word)
      if (request !== requestRef.current) return
      setEntry(result.entry)
      setStatus('success')
    } catch (caught) {
      if (request !== requestRef.current) return
      if (caught instanceof DictionaryNotFoundError) {
        const nextSuggestions = await fetchSuggestions(word)
        if (request !== requestRef.current) return
        setError(`没有找到“${word}”。`)
        setSuggestions(nextSuggestions.slice(0, 4))
      } else {
        setError('词典暂时没有回应，请稍后再试。')
      }
      setStatus('error')
    }
  }, [stopSpeech])

  useEffect(() => {
    const initialWord = getLookupWord(initialText)
    if (initialWord) lookupWord(initialText)
    else window.setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  useEffect(() => {
    if (!pipWindow) return undefined
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }
    pipWindow.document.addEventListener('keydown', closeOnEscape)
    return () => pipWindow.document.removeEventListener('keydown', closeOnEscape)
  }, [pipWindow, onClose])

  useEffect(() => {
    if (!pinMessage) return undefined
    const timer = window.setTimeout(() => setPinMessage(''), 5000)
    return () => window.clearTimeout(timer)
  }, [pinMessage])

  useEffect(() => () => {
    window.speechSynthesis?.cancel()
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
  }, [])

  useEffect(() => {
    return () => {
      requestRef.current += 1
    }
  }, [])

  useEffect(() => () => {
    const pip = pipWindowRef.current
    pipWindowRef.current = null
    if (pip) {
      try {
        pip.close()
      } catch {}
    }
  }, [])

  const candidates = useMemo(() => extractLookupWords(text).slice(0, 4), [text])
  const definitions = useMemo(() => {
    if (!entry) return []
    const items = []
    for (const meaning of entry.meanings || []) {
      for (const definition of (meaning.definitions || []).slice(0, 2)) {
        if (!definition.definition) continue
        items.push({
          partOfSpeech: meaning.partOfSpeech,
          text: definition.definition,
        })
        if (items.length >= 4) return items
      }
    }
    return items
  }, [entry])

  const handleSubmit = (event) => {
    event.preventDefault()
    lookupWord(text)
  }

  const handleLookupCandidate = (word) => {
    setText(word)
    lookupWord(word)
  }

  const closePinnedWindow = useCallback((message = '') => {
    const pip = pipWindowRef.current
    if (!pip) return
    pipWindowRef.current = null
    setPipWindow(null)
    if (message) setPinMessage(message)
    try {
      pip.close()
    } catch {}
  }, [])

  const togglePin = async () => {
    if (isNativeWindow) {
      try {
        await onToggleNativePin()
      } catch {
        setPinMessage('无法切换窗口置顶状态，请稍后再试。')
      }
      return
    }

    if (pipWindowRef.current) {
      closePinnedWindow('已取消置顶，悬浮窗已回到词典页面。')
      window.setTimeout(() => inputRef.current?.focus(), 30)
      return
    }

    if (typeof window.documentPictureInPicture?.requestWindow !== 'function') {
      setPinMessage('当前浏览器不支持系统级置顶；仍可使用页面内悬浮窗，或改用最新版 Chrome / Edge。')
      return
    }

    try {
      const pip = await window.documentPictureInPicture.requestWindow({ width: 390, height: 640 })
      copyStylesToPipWindow(pip)
      pipWindowRef.current = pip
      setPipWindow(pip)
      setPinMessage('')
      pip.addEventListener('pagehide', () => {
        if (pipWindowRef.current !== pip) return
        pipWindowRef.current = null
        setPipWindow(null)
        setPinMessage('置顶窗口已关闭，悬浮窗已回到页面。')
      }, { once: true })
      window.setTimeout(() => inputRef.current?.focus(), 60)
    } catch (caught) {
      setPinMessage(caught?.name === 'NotAllowedError'
        ? '已取消置顶。'
        : '无法打开置顶窗口，请检查浏览器权限；也可继续使用页面内悬浮窗。')
    }
  }

  const speak = () => {
    if (!entry?.word) return
    if (isSpeaking) {
      stopSpeech()
      return
    }
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance === 'undefined') return

    stopSpeech()
    const token = speechTokenRef.current
    const utterance = new window.SpeechSynthesisUtterance(entry.word)
    utterance.lang = 'en-US'
    utterance.rate = 0.9
    utterance.pitch = 1
    const voice = getPreferredAmericanVoice()
    if (voice) utterance.voice = voice
    utterance.onend = () => {
      if (token === speechTokenRef.current) setIsSpeaking(false)
    }
    utterance.onerror = () => {
      if (token === speechTokenRef.current) setIsSpeaking(false)
    }
    setIsSpeaking(true)
    window.speechSynthesis.speak(utterance)
  }

  const applyImage = useCallback(async (file) => {
    if (!file?.type?.startsWith('image/')) {
      setOcrMessage('请选择图片文件')
      return
    }

    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
    const url = URL.createObjectURL(file)
    imageUrlRef.current = url
    setImagePreview(url)
    setOcrMessage('准备识别…')

    try {
      const recognized = await recognizeEnglishImage(file, (progress, recognitionStatus) => {
        setOcrMessage(recognitionStatus === 'recognizing text' ? `识别中 ${progress}%` : '加载识别模型…')
      })
      const cleaned = recognized.replace(/\s+/g, ' ').trim()
      if (!cleaned) {
        setOcrMessage('没有识别到英文文字')
        return
      }
      setText(cleaned)
      setOcrMessage('识别完成，可修改文字后重查')
      lookupWord(cleaned)
    } catch {
      setOcrMessage('识别失败，请手动输入或换一张图')
    }
  }, [lookupWord])

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) applyImage(file)
  }

  const captureScreenshot = async () => {
    if (window.desktopApp?.captureRegion) {
      setOcrMessage('请拖选要识别的文字区域…')
      try {
        const capture = await window.desktopApp.captureRegion()
        if (capture?.canceled) {
          setOcrMessage('已取消截图')
          return
        }
        if (!capture?.dataUrl) throw new Error(capture?.error || 'Empty capture')
        const response = await fetch(capture.dataUrl)
        const blob = await response.blob()
        await applyImage(new File([blob], 'screenshot.png', { type: blob.type || 'image/png' }))
      } catch {
        setOcrMessage('截图失败，请改用图片上传')
      }
      return
    }

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setOcrMessage('当前浏览器不支持截图，请改用图片上传')
      return
    }

    let stream
    try {
      setOcrMessage('请选择要识别的窗口或屏幕…')
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const video = document.createElement('video')
      video.muted = true
      video.srcObject = stream
      await video.play()
      await new Promise((resolve) => window.setTimeout(resolve, 140))

      const width = video.videoWidth
      const height = video.videoHeight
      if (!width || !height) throw new Error('Empty screenshot')
      const scale = Math.min(1, 1600 / width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('Screenshot failed')
      await applyImage(new File([blob], 'screenshot.png', { type: 'image/png' }))
    } catch (caught) {
      setOcrMessage(caught?.name === 'NotAllowedError' ? '已取消截图' : '截图失败，请改用图片上传')
    } finally {
      stream?.getTracks().forEach((track) => track.stop())
    }
  }

  const handlePaste = (event) => {
    const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith('image/'))
    if (!imageItem) return
    const file = imageItem.getAsFile()
    if (file) {
      event.preventDefault()
      applyImage(file)
    }
  }

  const handleOpenMain = () => {
    const word = entry?.word || getLookupWord(text)
    if (word) onOpenMain(word)
  }

  const canOpenMain = Boolean(entry?.word || getLookupWord(text))
  const isPinned = isNativeWindow ? nativePinned : Boolean(pipWindow)
  const panelClassName = [
    'floating-lookup',
    pipWindow ? 'floating-lookup--pinned' : '',
    desktopWindow ? 'floating-lookup--desktop' : '',
  ].filter(Boolean).join(' ')

  const panel = (
    <aside
      className={panelClassName}
      role="dialog"
      aria-label="释义速查"
      onPaste={handlePaste}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const file = event.dataTransfer.files?.[0]
        if (file) applyImage(file)
      }}
    >
      <header className="floating-lookup-head">
        <span className="floating-lookup-title"><SparkIcon size={14} /> 释义速查</span>
        <div className="floating-head-actions">
          <button
            type="button"
            className={`floating-pin${isPinned ? ' floating-pin--active' : ''}`}
            onClick={togglePin}
            aria-pressed={isPinned}
            title={isPinned ? '取消窗口置顶' : '将速查窗置于其他窗口上方'}
          >
            <PinIcon size={12} filled={isPinned} />
            <span>{isPinned ? '取消置顶' : '置顶'}</span>
          </button>
          <button type="button" className="floating-close" onClick={onClose} aria-label="关闭释义速查">
            <CloseIcon size={14} />
          </button>
        </div>
      </header>

      {pinMessage && (
        <p className="floating-pin-notice" role="status">
          <PinIcon size={12} />
          <span>{pinMessage}</span>
        </p>
      )}

      <form className="floating-lookup-form" onSubmit={handleSubmit}>
        <div className="floating-input-row">
          <textarea
            ref={inputRef}
            className="floating-input"
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                lookupWord(text)
              }
            }}
            placeholder="输入单词或粘贴英文文字…"
            aria-label="输入要查询的单词或文字"
            spellCheck="false"
          />
          <button className="floating-submit" type="submit" disabled={!text.trim() || status === 'loading'} aria-label="查询释义">
            {status === 'loading' ? <span className="button-spinner" aria-hidden="true" /> : <SearchIcon size={15} />}
          </button>
        </div>

        <div className="floating-tools">
          <button type="button" onClick={() => fileRef.current?.click()}>
            <ImageIcon size={14} /> 图片
          </button>
          <button type="button" onClick={captureScreenshot}>
            <CaptureIcon size={14} /> 截图
          </button>
          {imagePreview && (
            <button
              type="button"
              className="floating-thumb"
              onClick={() => {
                if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current)
                imageUrlRef.current = ''
                setImagePreview('')
                setOcrMessage('')
              }}
              aria-label="移除图片"
              title="移除图片"
            >
              <img src={imagePreview} alt="" />
              <span><CloseIcon size={9} /></span>
            </button>
          )}
          <span className="floating-ocr-status" aria-live="polite">{ocrMessage}</span>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFileChange} />
        </div>
      </form>

      {candidates.length > 1 && (
        <div className="floating-candidates" aria-label="可用于查询的单词">
          <span>选词</span>
          {candidates.map((word) => (
            <button key={word} type="button" onClick={() => handleLookupCandidate(word)}>
              {word}
            </button>
          ))}
        </div>
      )}

      <div className="floating-lookup-body" aria-live="polite" aria-busy={status === 'loading'}>
        {status === 'idle' && (
          <p className="floating-empty">输入文字，或上传图片、截取屏幕，自动识别单词并只显示释义。</p>
        )}

        {status === 'loading' && (
          <div className="floating-loading">
            <span className="button-spinner" aria-hidden="true" />
            <span>正在查询释义…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="floating-error">
            <p>{error}</p>
            {suggestions.length > 0 && (
              <div className="floating-suggestions">
                <span>试试</span>
                {suggestions.map((word) => (
                  <button key={word} type="button" onClick={() => handleLookupCandidate(word)}>{word}</button>
                ))}
              </div>
            )}
          </div>
        )}

        {status === 'success' && entry && (
          <div className="floating-entry">
            <div className="floating-word-row">
              <div>
                <strong>{entry.word}</strong>
                {entry.phonetic && <span>{entry.phonetic}</span>}
              </div>
              <button
                type="button"
                className={`floating-speak ${isSpeaking ? 'floating-speak--playing' : ''}`}
                onClick={speak}
                aria-label={isSpeaking ? '停止朗读' : '朗读单词'}
                aria-pressed={isSpeaking}
              >
                <VolumeIcon size={14} />
                <span>{isSpeaking ? '停止' : '朗读'}</span>
              </button>
            </div>
            <div className="floating-definitions">
              {definitions.map((definition, index) => (
                <div className="floating-definition" key={`${definition.partOfSpeech}-${index}`}>
                  <span className="floating-pos">{displayPartOfSpeech(definition.partOfSpeech)}</span>
                  <div>
                    <p>{definition.text}</p>
                    <TranslatedText text={definition.text} className="floating-definition-translation" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="floating-lookup-foot">
        <span>仅显示释义</span>
        <button type="button" onClick={handleOpenMain} disabled={!canOpenMain}>
          <BackIcon size={13} /> 返回词典看完整解释
        </button>
      </footer>
    </aside>
  )

  return pipWindow ? createPortal(panel, pipWindow.document.body) : panel
}

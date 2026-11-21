import { useCallback, useEffect, useState } from 'react'
import { FloatingLookup } from './components/FloatingLookup'

function readFloatingRequest() {
  const params = new URLSearchParams(window.location.search)
  return {
    text: params.get('q') || '',
    pinned: params.get('pinned') === '1',
  }
}

export function FloatingApp() {
  const [request, setRequest] = useState(() => ({ ...readFloatingRequest(), id: 0 }))
  const [pinned, setPinned] = useState(() => readFloatingRequest().pinned)

  useEffect(() => {
    document.body.classList.add('desktop-float-window')
    document.title = 'Lexicon｜释义速查'
    return () => document.body.classList.remove('desktop-float-window')
  }, [])

  useEffect(() => {
    const desktop = window.desktopApp
    if (!desktop) return undefined

    let active = true
    const unsubscribe = desktop.onFloatingQuery?.((text) => {
      setRequest((previous) => ({ text: text || '', id: previous.id + 1 }))
    })
    desktop.getFloatingState?.()
      .then((state) => {
        if (active && typeof state?.pinned === 'boolean') setPinned(state.pinned)
      })
      .catch(() => {})

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [])

  const togglePin = useCallback(async () => {
    try {
      const next = await window.desktopApp?.toggleFloatingPin()
      if (typeof next === 'boolean') setPinned(next)
    } catch {}
  }, [])

  const closeWindow = useCallback(() => {
    void window.desktopApp?.closeFloatingWindow()
  }, [])

  const openMainLookup = useCallback((word) => {
    void window.desktopApp?.openMainLookup(word)
  }, [])

  return (
    <FloatingLookup
      key={request.id}
      initialQuery={request.text}
      onClose={closeWindow}
      onOpenMain={openMainLookup}
      desktopWindow
      nativePinned={pinned}
      onToggleNativePin={togglePin}
    />
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BACKGROUNDS_CHANGED_EVENT,
  HISTORY_ADDED_EVENT,
  HISTORY_CLEARED_EVENT,
  clearRemoteHistory,
  deleteRemoteFavorite,
  describeAccountError,
  mergeRemoteState,
  pushBackgroundSettings,
  pushFavorite,
  pushProfile,
  signInAsGuest,
  signInWithEmail,
  signOutAccount,
  signUpWithEmail,
  upsertHistoryWord,
} from './account'
import { getSelectedBackgroundIds } from './backgrounds'
import { FAVORITES_CHANGED_EVENT } from './favorites'
import { getLocalProfile, saveLocalProfile } from './profile'
import { supabase, supabaseConfigured } from './supabase'

export function useAccount(options = {}) {
  const callbacksRef = useRef(options)
  callbacksRef.current = options

  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(!supabaseConfigured)
  const [busy, setBusy] = useState(false)
  const [syncState, setSyncState] = useState('idle')
  const [syncError, setSyncError] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState(0)
  const [profile, setProfile] = useState(() => getLocalProfile())
  const sessionRef = useRef(null)
  const syncingRef = useRef(false)
  const backgroundTimerRef = useRef(null)
  const lastFocusSyncRef = useRef(0)

  const setActiveSession = useCallback((nextSession) => {
    sessionRef.current = nextSession ?? null
    setSession(nextSession ?? null)
  }, [])

  const syncNow = useCallback(async () => {
    const current = sessionRef.current
    if (!supabase || !current?.user) {
      setSyncState('idle')
      return
    }
    if (syncingRef.current) return

    syncingRef.current = true
    setSyncState('syncing')
    setSyncError('')

    try {
      const result = await mergeRemoteState(current.user.id)
      callbacksRef.current.onHistoryMerged?.(result.history)
      if (result.backgrounds) callbacksRef.current.onBackgroundsMerged?.(result.backgrounds)
      if (result.favorites) callbacksRef.current.onFavoritesMerged?.(result.favorites)
      if (result.profile) setProfile(result.profile)
      setSyncState('synced')
      setLastSyncedAt(Date.now())
    } catch (error) {
      setSyncState('error')
      setSyncError(describeAccountError(error))
    } finally {
      syncingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!supabase) {
      setReady(true)
      return undefined
    }

    let active = true
    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      setActiveSession(data.session ?? null)
      setReady(true)
      if (data.session?.user) window.setTimeout(() => { if (active) void syncNow() }, 0)
    }
    void bootstrap()

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setActiveSession(nextSession ?? null)
      if (event === 'SIGNED_IN' && nextSession?.user) {
        window.setTimeout(() => { if (active) void syncNow() }, 0)
      }
      if (event === 'SIGNED_OUT') {
        setSyncState('idle')
        setSyncError('')
      }
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [setActiveSession, syncNow])

  useEffect(() => {
    if (!supabase) return undefined

    const push = async (task) => {
      const current = sessionRef.current
      if (!current?.user) return
      setSyncState('syncing')
      setSyncError('')
      try {
        await task(current.user.id)
        setSyncState('synced')
        setLastSyncedAt(Date.now())
      } catch (error) {
        setSyncState('error')
        setSyncError(describeAccountError(error))
      }
    }

    const onHistoryAdded = (event) => {
      const word = event.detail?.word
      if (word) void push((userId) => upsertHistoryWord(userId, word))
    }
    const onHistoryCleared = () => void push((userId) => clearRemoteHistory(userId))
    const onFavoritesChanged = (event) => {
      const word = event.detail?.word
      if (!word) return
      const remove = event.detail?.action === 'remove'
      void push((userId) => (
        remove ? deleteRemoteFavorite(userId, word) : pushFavorite(userId, word)
      ))
    }
    const onBackgroundsChanged = () => {
      if (!sessionRef.current?.user) return
      window.clearTimeout(backgroundTimerRef.current)
      backgroundTimerRef.current = window.setTimeout(() => {
        void push((userId) => pushBackgroundSettings(userId, getSelectedBackgroundIds()))
      }, 800)
    }

    window.addEventListener(HISTORY_ADDED_EVENT, onHistoryAdded)
    window.addEventListener(HISTORY_CLEARED_EVENT, onHistoryCleared)
    window.addEventListener(FAVORITES_CHANGED_EVENT, onFavoritesChanged)
    window.addEventListener(BACKGROUNDS_CHANGED_EVENT, onBackgroundsChanged)

    return () => {
      window.removeEventListener(HISTORY_ADDED_EVENT, onHistoryAdded)
      window.removeEventListener(HISTORY_CLEARED_EVENT, onHistoryCleared)
      window.removeEventListener(FAVORITES_CHANGED_EVENT, onFavoritesChanged)
      window.removeEventListener(BACKGROUNDS_CHANGED_EVENT, onBackgroundsChanged)
      window.clearTimeout(backgroundTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return undefined
    const onFocus = () => {
      if (!sessionRef.current?.user) return
      const now = Date.now()
      if (now - lastFocusSyncRef.current < 30000) return
      lastFocusSyncRef.current = now
      void syncNow()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [syncNow])

  const signIn = useCallback(async (email, password) => {
    setBusy(true)
    try {
      await signInWithEmail(email, password)
    } finally {
      setBusy(false)
    }
  }, [])

  const signUp = useCallback(async (email, password) => {
    setBusy(true)
    try {
      return await signUpWithEmail(email, password)
    } finally {
      setBusy(false)
    }
  }, [])

  const signInGuest = useCallback(async () => {
    setBusy(true)
    try {
      await signInAsGuest()
    } finally {
      setBusy(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    setBusy(true)
    try {
      await signOutAccount()
    } finally {
      setBusy(false)
      setActiveSession(null)
      setSyncState('idle')
      setSyncError('')
    }
  }, [setActiveSession])

  const updateProfile = useCallback(async (nextProfile) => {
    const saved = saveLocalProfile(nextProfile, { updatedAt: Date.now() })
    setProfile(saved)

    const current = sessionRef.current
    if (!supabase || !current?.user) return saved

    setSyncState('syncing')
    setSyncError('')
    try {
      await pushProfile(current.user.id, saved)
      setSyncState('synced')
      setLastSyncedAt(Date.now())
    } catch (error) {
      setSyncState('error')
      setSyncError(describeAccountError(error))
      throw error
    }
    return saved
  }, [])

  const user = session?.user ?? null

  return {
    configured: supabaseConfigured,
    ready,
    session,
    user,
    isGuest: Boolean(user && (user.is_anonymous || !user.email)),
    busy,
    syncState,
    syncError,
    lastSyncedAt,
    profile,
    signIn,
    signUp,
    signInGuest,
    signOut,
    updateProfile,
    syncNow,
  }
}

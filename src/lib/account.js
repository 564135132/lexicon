import {
  getRecentSearches,
  RECENT_LIMIT,
  replaceRecentSearches,
} from './dictionary'
import {
  getBackgroundSettingsUpdatedAt,
  getSelectedBackgroundIds,
  replaceSelectedBackgroundIds,
} from './backgrounds'
import {
  getLocalProfile,
  hasProfileData,
  MAX_AVATAR_DATA_LENGTH,
  normalizeDisplayName,
  saveLocalProfile,
} from './profile'
import { supabase } from './supabase'
import { getFavorites, replaceFavorites } from './favorites'

export const HISTORY_ADDED_EVENT = 'lexicon:history-added'
export const HISTORY_CLEARED_EVENT = 'lexicon:history-cleared'
export const BACKGROUNDS_CHANGED_EVENT = 'lexicon:backgrounds-changed'
export const FAVORITE_LIMIT = 500

export function emitHistoryAdded(word) {
  if (!word) return
  window.dispatchEvent(new CustomEvent(HISTORY_ADDED_EVENT, { detail: { word } }))
}

export function emitHistoryCleared() {
  window.dispatchEvent(new CustomEvent(HISTORY_CLEARED_EVENT))
}

export function emitBackgroundsChanged() {
  window.dispatchEvent(new CustomEvent(BACKGROUNDS_CHANGED_EVENT))
}

function requireClient() {
  if (!supabase) throw new Error('Supabase 尚未配置。')
  return supabase
}

export function describeAccountError(error) {
  const message = String(error?.message || error || '')
  const code = String(error?.code || '')

  if (code === 'anonymous_provider_disabled' || /anonymous.*disabled/i.test(message)) {
    return '游客登录尚未开启。请在 Supabase 后台 Authentication → Providers 中启用 Anonymous sign-ins。'
  }
  if (/email not confirmed/i.test(message)) {
    return '邮箱还没有验证，请先打开验证邮件里的链接。'
  }
  if (/invalid login credentials/i.test(message)) {
    return '邮箱或密码不正确。'
  }
  if (/user already registered/i.test(message)) {
    return '这个邮箱已经注册过了，请直接登录。'
  }
  if (/password should be at least/i.test(message)) {
    return '密码至少需要 6 位。'
  }
  if (/rate limit|too many requests|over_email_send_rate_limit/i.test(message)) {
    return '操作太频繁，请稍后再试。'
  }
  if (/signups not allowed|signup is disabled/i.test(message)) {
    return '当前项目已关闭邮箱注册，请在 Supabase 后台开启。'
  }
  if (code === 'PGRST205' || /could not find the table|relation .* does not exist/i.test(message)) {
    return '云同步数据表尚未创建，请在 Supabase SQL Editor 执行 supabase/schema.sql。'
  }
  if (
    code === '42703' ||
    code === 'PGRST204' ||
    /column .* does not exist|could not find the .* column|schema cache.*column/i.test(message)
  ) {
    return '数据库缺少头像/用户名字段，请执行 supabase/migrations/20261125_profile_fields.sql。'
  }
  if (/permission denied/i.test(message)) {
    return '数据库权限不足，请确认 supabase/schema.sql 中的 RLS 与 GRANT 已完整执行。'
  }
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return '无法连接云端，请检查网络后重试。'
  }
  return message || '操作失败，请稍后再试。'
}

export async function signInWithEmail(email, password) {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signUpWithEmail(email, password) {
  const { data, error } = await requireClient().auth.signUp({ email, password })
  if (error) throw error
  return data
}

export async function signInAsGuest() {
  const { data, error } = await requireClient().auth.signInAnonymously()
  if (error) throw error
  return data
}

export async function signOutAccount() {
  const { error } = await requireClient().auth.signOut()
  if (error) throw error
}

export async function mergeRemoteState(userId) {
  const client = requireClient()
  const [historyResult, settingsResult, favorites] = await Promise.all([
    client
      .from('search_history')
      .select('word, searched_at')
      .eq('user_id', userId)
      .order('searched_at', { ascending: false })
      .limit(RECENT_LIMIT),
    client
      .from('user_settings')
      .select('selected_background_ids, updated_at')
      .eq('user_id', userId)
      .maybeSingle(),
    // 收藏表缺失或暂时不可用时，不影响历史与背景的同步。
    mergeRemoteFavorites(userId).catch((error) => {
      console.warn('Favorites sync skipped:', error?.message || error)
      return null
    }),
  ])

  if (historyResult.error) throw historyResult.error
  if (settingsResult.error) throw settingsResult.error

  const localHistory = getRecentSearches()
  const remoteHistory = (historyResult.data ?? [])
    .map((row) => row.word)
    .filter((word) => typeof word === 'string' && word.length > 0)
  const mergedHistory = [...new Set([...localHistory, ...remoteHistory])].slice(0, RECENT_LIMIT)
  const remoteWords = new Set(remoteHistory)
  const missingLocalWords = localHistory.filter((word) => !remoteWords.has(word))

  if (missingLocalWords.length) {
    const now = Date.now()
    const rows = missingLocalWords.map((word, index) => ({
      user_id: userId,
      word,
      searched_at: new Date(now - (index + 1) * 1000).toISOString(),
    }))
    const { error } = await client
      .from('search_history')
      .upsert(rows, { onConflict: 'user_id,word', ignoreDuplicates: true })
    if (error) throw error
  }

  replaceRecentSearches(mergedHistory)

  const settingsRow = settingsResult.data
  const localBackgrounds = getSelectedBackgroundIds()
  const localUpdatedAt = getBackgroundSettingsUpdatedAt()
  let backgrounds = null

  if (!settingsRow) {
    await pushBackgroundSettings(userId, localBackgrounds)
  } else {
    const remoteUpdatedAt = Date.parse(settingsRow.updated_at) || 0
    if (localUpdatedAt > remoteUpdatedAt + 2000) {
      await pushBackgroundSettings(userId, localBackgrounds)
    } else {
      backgrounds = replaceSelectedBackgroundIds(settingsRow.selected_background_ids, {
        updatedAt: remoteUpdatedAt,
      })
    }
  }

  let profile = null
  try {
    const profileResult = await client
      .from('profiles')
      .select('display_name, avatar_data, updated_at')
      .eq('id', userId)
      .maybeSingle()
    if (profileResult.error) throw profileResult.error

    const localProfile = getLocalProfile()
    const row = profileResult.data
    const remoteProfile = {
      displayName: normalizeDisplayName(row?.display_name),
      avatarData:
        typeof row?.avatar_data === 'string' && row.avatar_data.length <= MAX_AVATAR_DATA_LENGTH
          ? row.avatar_data
          : '',
      updatedAt: Date.parse(row?.updated_at) || 0,
    }
    const localHas = hasProfileData(localProfile)
    const remoteHas = hasProfileData(remoteProfile)

    if (localHas && !remoteHas) {
      await pushProfile(userId, localProfile)
      profile = localProfile
    } else if (remoteProfile.updatedAt > localProfile.updatedAt + 2000) {
      profile = saveLocalProfile(remoteProfile, { updatedAt: remoteProfile.updatedAt })
    } else if (localHas && localProfile.updatedAt > remoteProfile.updatedAt + 2000) {
      await pushProfile(userId, localProfile)
      profile = localProfile
    } else {
      profile = saveLocalProfile(remoteProfile, { updatedAt: remoteProfile.updatedAt })
    }
  } catch (error) {
    console.warn('Profile sync failed:', error?.message || error)
  }

  return { history: mergedHistory, backgrounds, profile, favorites }
}

// 合并云端收藏与本地收藏：并集，本地新增的补写到云端。
export async function mergeRemoteFavorites(userId) {
  const client = requireClient()
  const { data, error } = await client
    .from('favorites')
    .select('word, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(FAVORITE_LIMIT)
  if (error) throw error

  const remote = (data ?? [])
    .filter((row) => typeof row?.word === 'string' && row.word.trim())
    .map((row) => ({
      word: row.word.trim().toLowerCase(),
      addedAt: typeof row.created_at === 'string' ? row.created_at : '',
    }))

  const remoteWords = new Set(remote.map((item) => item.word))
  const local = getFavorites()
  const missing = local.filter((item) => !remoteWords.has(item.word))
  if (missing.length) {
    const rows = missing.map((item) => ({
      user_id: userId,
      word: item.word,
      created_at: item.addedAt || new Date().toISOString(),
    }))
    const { error: upsertError } = await client
      .from('favorites')
      .upsert(rows, { onConflict: 'user_id,word', ignoreDuplicates: true })
    if (upsertError) throw upsertError
  }

  return replaceFavorites([...local, ...remote])
}

export async function pushFavorite(userId, rawWord) {
  const word = String(rawWord ?? '').trim().toLowerCase()
  if (!word) return
  const { error } = await requireClient()
    .from('favorites')
    .upsert(
      { user_id: userId, word },
      { onConflict: 'user_id,word', ignoreDuplicates: true },
    )
  if (error) throw error
}

export async function deleteRemoteFavorite(userId, rawWord) {
  const word = String(rawWord ?? '').trim().toLowerCase()
  if (!word) return
  const { error } = await requireClient()
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('word', word)
  if (error) throw error
}

export async function upsertHistoryWord(userId, rawWord) {
  const word = String(rawWord ?? '').trim().toLowerCase()
  if (!word) return
  const { error } = await requireClient()
    .from('search_history')
    .upsert(
      { user_id: userId, word, searched_at: new Date().toISOString() },
      { onConflict: 'user_id,word' },
    )
  if (error) throw error
}

export async function clearRemoteHistory(userId) {
  const { error } = await requireClient().from('search_history').delete().eq('user_id', userId)
  if (error) throw error
}

export async function pushBackgroundSettings(userId, ids) {
  const { error } = await requireClient()
    .from('user_settings')
    .upsert(
      {
        user_id: userId,
        selected_background_ids: Array.isArray(ids) ? ids : [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )
  if (error) throw error
}

export async function pushProfile(userId, profile) {
  const displayName = normalizeDisplayName(profile?.displayName)
  const avatarData =
    typeof profile?.avatarData === 'string' && profile.avatarData.length <= MAX_AVATAR_DATA_LENGTH
      ? profile.avatarData
      : ''
  const { error } = await requireClient()
    .from('profiles')
    .upsert(
      {
        id: userId,
        display_name: displayName || null,
        avatar_data: avatarData || null,
      },
      { onConflict: 'id' },
    )
  if (error) throw error
}

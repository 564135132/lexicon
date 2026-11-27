import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const withGuest = process.argv.includes('--with-guest')

function readLocalEnv() {
  const values = {}
  const envPath = path.join(rootDir, '.env.local')
  if (!fs.existsSync(envPath)) return values
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
  return values
}

const localEnv = readLocalEnv()
const url = (process.env.VITE_SUPABASE_URL || localEnv.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const key = process.env.VITE_SUPABASE_ANON_KEY || localEnv.VITE_SUPABASE_ANON_KEY || ''

if (!url || !key) {
  console.error('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY。')
  process.exit(1)
}

let hasProblem = false
const headers = { apikey: key, Authorization: `Bearer ${key}` }

const settingsResponse = await fetch(`${url}/auth/v1/settings`, { headers })
const settings = settingsResponse.ok ? await settingsResponse.json() : null
const anonymousEnabled = Boolean(settings?.external?.anonymous_users)
const emailEnabled = Boolean(settings?.external?.email)

console.log(`项目: ${url}`)
console.log(`认证配置: ${settingsResponse.status} 邮箱=${emailEnabled ? '开启' : '关闭'} 匿名=${anonymousEnabled ? '开启' : '关闭'} 邮箱确认=${settings?.mailer_autoconfirm ? '关闭' : '开启'}`)
if (!anonymousEnabled) hasProblem = true

const tables = ['profiles', 'search_history', 'user_settings', 'favorites']
for (const table of tables) {
  const response = await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers })
  let state = `HTTP ${response.status}`
  if (response.status === 401 || response.status === 403) state = '存在且受保护'
  else if (response.status === 404) {
    state = '不存在'
    hasProblem = true
  } else if (response.ok) {
    state = '匿名可读，请检查 RLS/GRANT'
    hasProblem = true
  }
  console.log(`表 ${table}: ${state}`)
}

if (withGuest && anonymousEnabled) {
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: authData, error: authError } = await client.auth.signInAnonymously()
  if (authError) {
    hasProblem = true
    console.log(`游客登录: 失败 ${authError.message}`)
  } else {
    const userId = authData.user.id
    console.log(`游客登录: 成功 ${userId}`)
    const word = `healthcheck-${Date.now()}`
    const checks = []

    const profile = await client
      .from('profiles')
      .select('id, is_guest, display_name, avatar_data')
      .eq('id', userId)
      .maybeSingle()
    checks.push(['读取自己的 profile', !profile.error && profile.data?.is_guest === true, profile.error?.message])

    const profileWrite = await client
      .from('profiles')
      .update({ display_name: 'Healthcheck', avatar_data: 'data:image/webp;base64,AAAA' })
      .eq('id', userId)
    checks.push(['写入头像和用户名', !profileWrite.error, profileWrite.error?.message])

    const profileRead = await client
      .from('profiles')
      .select('display_name, avatar_data')
      .eq('id', userId)
      .maybeSingle()
    checks.push([
      '读取头像和用户名',
      !profileRead.error && profileRead.data?.display_name === 'Healthcheck',
      profileRead.error?.message,
    ])

    const profileCleanup = await client
      .from('profiles')
      .update({ display_name: null, avatar_data: null })
      .eq('id', userId)
    checks.push(['清理测试资料', !profileCleanup.error, profileCleanup.error?.message])

    const historyWrite = await client
      .from('search_history')
      .upsert({ user_id: userId, word, searched_at: new Date().toISOString() }, { onConflict: 'user_id,word' })
    checks.push(['写入搜索历史', !historyWrite.error, historyWrite.error?.message])

    const historyRead = await client.from('search_history').select('word').eq('user_id', userId).eq('word', word)
    checks.push(['读取搜索历史', !historyRead.error && historyRead.data?.length === 1, historyRead.error?.message])

    const settingsWrite = await client
      .from('user_settings')
      .upsert({ user_id: userId, selected_background_ids: ['lake', 'forest'] }, { onConflict: 'user_id' })
    checks.push(['写入背景设置', !settingsWrite.error, settingsWrite.error?.message])

    const settingsRead = await client
      .from('user_settings')
      .select('selected_background_ids')
      .eq('user_id', userId)
      .maybeSingle()
    checks.push([
      '读取背景设置',
      !settingsRead.error && settingsRead.data?.selected_background_ids?.length === 2,
      settingsRead.error?.message,
    ])

    const favoriteWrite = await client
      .from('favorites')
      .upsert({ user_id: userId, word }, { onConflict: 'user_id,word', ignoreDuplicates: true })
    checks.push(['写入收藏', !favoriteWrite.error, favoriteWrite.error?.message])

    const favoriteRead = await client
      .from('favorites')
      .select('word, created_at')
      .eq('user_id', userId)
      .eq('word', word)
    checks.push(['读取收藏', !favoriteRead.error && favoriteRead.data?.length === 1, favoriteRead.error?.message])

    const favoriteDelete = await client
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('word', word)
    checks.push(['删除收藏', !favoriteDelete.error, favoriteDelete.error?.message])

    const cleanupHistory = await client.from('search_history').delete().eq('user_id', userId).eq('word', word)
    checks.push(['清理测试历史', !cleanupHistory.error, cleanupHistory.error?.message])
    const cleanupSettings = await client.from('user_settings').delete().eq('user_id', userId)
    checks.push(['清理测试设置', !cleanupSettings.error, cleanupSettings.error?.message])

    for (const [label, ok, detail] of checks) {
      console.log(`${label}: ${ok ? '通过' : `失败${detail ? ` (${detail})` : ''}`}`)
      if (!ok) hasProblem = true
    }
    await client.auth.signOut()
  }
}

if (withGuest === false && anonymousEnabled) {
  console.log('提示: 运行 `npm run check:supabase -- --with-guest` 可执行完整的游客读写与 RLS 测试。')
}

if (hasProblem) {
  console.log('结果: 还有未完成的配置，请参考 README 的“账号与云同步”。')
  process.exit(1)
}
console.log('结果: 云端配置正常。')

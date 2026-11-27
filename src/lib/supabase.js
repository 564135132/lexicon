import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

function readLocal(key) {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeLocal(key, value) {
  try {
    window.localStorage.setItem(key, value)
  } catch {}
}

function removeLocal(key) {
  try {
    window.localStorage.removeItem(key)
  } catch {}
}

// 桌面版把会话同时写进 Electron 的加密文件（%APPDATA%\Lexicon\supabase-auth.json），
// 这样即使进程被强制结束、localStorage 被清理或渲染进程崩溃，重启后仍能恢复登录。
// Web 版没有这个桥接，返回 undefined 让 supabase-js 使用默认的 localStorage。
function createAuthStorage() {
  const bridge = typeof window !== 'undefined' ? window.desktopApp?.authStorage : null
  if (!bridge) return undefined

  return {
    async getItem(key) {
      try {
        const durable = await bridge.getItem(key)
        if (typeof durable === 'string' && durable) {
          // 加密文件是权威来源，顺手把它回填到 localStorage 供 Web 侧逻辑读取。
          writeLocal(key, durable)
          return durable
        }
      } catch {}

      // 加密文件缺失（旧版本升级、文件被删）时用 localStorage 里的会话兜底，
      // 并把它补写回加密文件，保证下次启动走持久化路径。
      const local = readLocal(key)
      if (local) {
        try {
          await bridge.setItem(key, local)
        } catch {}
      }
      return local
    },
    async setItem(key, value) {
      writeLocal(key, value)
      try {
        await bridge.setItem(key, value)
      } catch {}
    },
    async removeItem(key) {
      removeLocal(key)
      try {
        await bridge.removeItem(key)
      } catch {}
    },
  }
}

const authStorage = createAuthStorage()

export const supabase = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: authStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null

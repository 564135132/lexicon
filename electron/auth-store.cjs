const fs = require('node:fs')
const path = require('node:path')
const { safeStorage } = require('electron')

const FILE_NAME = 'supabase-auth.json'
const KEY_PREFIX = 'sb-'
const MAX_KEY_LENGTH = 200
const MAX_VALUE_LENGTH = 512 * 1024

async function encryptValue(value) {
  try {
    if (await safeStorage.isAsyncEncryptionAvailable()) {
      const encrypted = await safeStorage.encryptStringAsync(value)
      return { version: 1, encrypted: true, payload: encrypted.toString('base64') }
    }
  } catch {}
  return { version: 1, encrypted: false, payload: value }
}

async function decryptValue(stored) {
  if (!stored || stored.version !== 1 || typeof stored.payload !== 'string') {
    return { value: null, reEncrypt: false }
  }
  if (!stored.encrypted) return { value: stored.payload, reEncrypt: false }

  try {
    const buffer = Buffer.from(stored.payload, 'base64')
    let decrypted = await safeStorage.decryptStringAsync(buffer)
    // 系统密钥轮换后（例如 Windows 用户密码变更或凭据保护状态变化），
    // Electron 会把数据标记为需要重新加密。再解一次以拿到新密钥下的明文，
    // 然后由调用方把文件写回，避免后续读取继续依赖旧密钥。
    if (decrypted.shouldReEncrypt) {
      decrypted = await safeStorage.decryptStringAsync(buffer)
      return { value: decrypted.result, reEncrypt: true }
    }
    return { value: decrypted.result, reEncrypt: false }
  } catch {
    return { value: null, reEncrypt: false }
  }
}

function parseValues(text) {
  try {
    const values = JSON.parse(text ?? '{}')
    return values && typeof values === 'object' ? values : {}
  } catch {
    return {}
  }
}

function createAuthStore(userDataDir) {
  const filePath = path.join(userDataDir, FILE_NAME)
  const tempPath = `${filePath}.tmp`
  let writeQueue = Promise.resolve()

  async function writeAll(values) {
    try {
      const stored = await encryptValue(JSON.stringify(values))
      fs.writeFileSync(tempPath, JSON.stringify(stored), { encoding: 'utf8', mode: 0o600 })
      fs.renameSync(tempPath, filePath)
    } catch {}
  }

  async function readAll() {
    let stored = null
    try {
      stored = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch {
      return {}
    }

    const { value, reEncrypt } = await decryptValue(stored)
    const values = parseValues(value)
    if (reEncrypt) await writeAll(values)
    return values
  }

  // 会话刷新时 Supabase 会连续读写同一个 key，串行化写入可以避免
  // 读-改-写之间互相覆盖。读取不排队，因为它不会修改文件（密钥轮换除外）。
  function enqueue(task) {
    const run = writeQueue.then(task, task)
    writeQueue = run.catch(() => {})
    return run
  }

  function isAllowedKey(key) {
    return typeof key === 'string' && key.startsWith(KEY_PREFIX) && key.length <= MAX_KEY_LENGTH
  }

  return {
    async get(key) {
      if (!isAllowedKey(key)) return null
      const value = (await readAll())[key]
      return typeof value === 'string' ? value : null
    },
    set(key, value) {
      if (!isAllowedKey(key) || typeof value !== 'string') return Promise.resolve(false)
      if (value.length > MAX_VALUE_LENGTH) return Promise.resolve(false)
      return enqueue(async () => {
        const values = await readAll()
        values[key] = value
        await writeAll(values)
        return true
      })
    },
    remove(key) {
      if (!isAllowedKey(key)) return Promise.resolve(false)
      return enqueue(async () => {
        const values = await readAll()
        if (!(key in values)) return true
        delete values[key]
        await writeAll(values)
        return true
      })
    },
  }
}

function registerAuthStorage(ipcMain, userDataDir) {
  const store = createAuthStore(userDataDir)
  ipcMain.handle('auth-storage:get', (_event, key) => store.get(key))
  ipcMain.handle('auth-storage:set', (_event, key, value) => store.set(key, value))
  ipcMain.handle('auth-storage:remove', (_event, key) => store.remove(key))
}

module.exports = { registerAuthStorage }

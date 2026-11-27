// 验证桌面版 Supabase 会话持久化：游客登录 -> 关闭进程 -> 重新启动 -> 仍保持登录。
// 运行：node qa/session-persistence-e2e.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
// 默认用 node_modules 里的 Electron 跑源码；设置 LEXICON_EXECUTABLE 可以改测已打包的 exe。
const packagedExecutable = process.env.LEXICON_EXECUTABLE
const electronPath = packagedExecutable
  ? path.resolve(root, packagedExecutable)
  : path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe')
const electronArgs = packagedExecutable ? [] : ['.']
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lexicon-session-'))
const authFile = path.join(userDataDir, 'supabase-auth.json')

console.log('userDataDir:', userDataDir)

async function launch() {
  // 在 Electron 自带的终端里运行时 ELECTRON_RUN_AS_NODE 可能被设为 1，
  // 这会让 Electron 以 Node 模式启动而无法打开窗口。
  const env = { ...process.env, LEXICON_USER_DATA_DIR: userDataDir }
  delete env.ELECTRON_RUN_AS_NODE

  const app = await electron.launch({
    executablePath: electronPath,
    args: electronArgs,
    cwd: root,
    env,
    timeout: 60000,
  })
  const page = await app.firstWindow({ timeout: 60000 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('.account-trigger', { timeout: 30000 })
  return { app, page }
}

async function label(page) {
  return (await page.locator('.account-trigger-label').innerText()).trim()
}

async function authKeys(page) {
  return page.evaluate(() =>
    Object.keys(window.localStorage).filter((key) => key.startsWith('sb-')),
  )
}

async function close(app) {
  // 模拟用户正常关闭：直接退出应用，不做任何额外的登出操作。
  await app.close().catch(() => {})
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

// 第一次启动：登录游客账号
let session = await launch()
let currentLabel = await label(session.page)
console.log('initial label:', currentLabel)

if (currentLabel === '登录') {
  await session.page.locator('.account-trigger').click()
  await session.page.waitForSelector('.account-guest', { timeout: 15000 })
  await session.page.locator('.account-guest').click()
  await session.page.waitForTimeout(1000)
  await session.page.waitForFunction(
    () => document.querySelector('.account-trigger-label')?.textContent?.trim() === '游客',
    { timeout: 30000 },
  )
}

currentLabel = await label(session.page)
check('首次启动后已登录', currentLabel === '游客', `label=${currentLabel}`)

const keysBefore = await authKeys(session.page)
check('会话写入 localStorage', keysBefore.length > 0, keysBefore.join(','))

await session.page.waitForTimeout(1200)
await close(session.app)

const authFileExists = fs.existsSync(authFile)
check('会话写入加密备份文件', authFileExists, authFile)
if (authFileExists) {
  const raw = fs.readFileSync(authFile, 'utf8')
  check('备份文件已加密（不含明文 access_token）', !raw.includes('access_token'))
}

// 第二次启动：不重新登录，直接检查状态
session = await launch()
await session.page.waitForTimeout(2500)
currentLabel = await label(session.page)
check('重启后仍保持登录', currentLabel === '游客', `label=${currentLabel}`)

const keysAfter = await authKeys(session.page)
check('重启后 localStorage 仍有会话', keysAfter.length > 0, keysAfter.join(','))

// 退出登录后应清除会话
await session.page.locator('.account-trigger').click()
await session.page.waitForTimeout(400)
const signOut = session.page.locator('button', { hasText: '退出登录' }).first()
if (await signOut.count()) {
  await signOut.click()
  await session.page.waitForTimeout(1500)
}
await close(session.app)

session = await launch()
await session.page.waitForTimeout(1500)
currentLabel = await label(session.page)
check('退出登录后重启保持未登录', currentLabel === '登录', `label=${currentLabel}`)
const fileAfterSignOut = fs.existsSync(authFile) ? fs.readFileSync(authFile, 'utf8') : ''
check('退出登录后备份文件不含会话', !fileAfterSignOut.includes('access_token'))
await close(session.app)

const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exitCode = failed.length ? 1 : 0

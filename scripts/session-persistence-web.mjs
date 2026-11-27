// 验证 Web 版 Supabase 会话持久化：游客登录 -> 刷新页面 -> 仍保持登录。
// 先运行 npm run preview，再执行：node qa/session-persistence-web.mjs
import { chromium } from 'playwright-core'

const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const base = process.env.LEXICON_WEB_URL || 'http://127.0.0.1:4173/'

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const errors = []
page.on('pageerror', (error) => errors.push(error.message))

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

const label = async () => (await page.locator('.account-trigger-label').innerText()).trim()

await page.goto(base, { waitUntil: 'networkidle' })
await page.waitForSelector('.account-trigger', { timeout: 30000 })

if ((await label()) === '登录') {
  await page.locator('.account-trigger').click()
  await page.waitForSelector('.account-guest', { timeout: 15000 })
  await page.locator('.account-guest').click()
  await page.waitForFunction(
    () => document.querySelector('.account-trigger-label')?.textContent?.trim() === '游客',
    { timeout: 30000 },
  )
}
check('Web 首次登录成功', (await label()) === '游客')

const keys = await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('sb-')))
check('Web 会话写入 localStorage', keys.length > 0, keys.join(','))

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('.account-trigger', { timeout: 30000 })
await page.waitForTimeout(1200)
check('刷新后仍保持登录', (await label()) === '游客', `label=${await label()}`)
check('无页面异常', errors.length === 0, errors.join('; '))

await browser.close()
const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exitCode = failed.length ? 1 : 0

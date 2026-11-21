import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2] || 'nsis'
const cacheDir = process.env.ELECTRON_BUILDER_CACHE || path.join(os.homedir(), '.lexicon-build-cache')

mkdirSync(cacheDir, { recursive: true })
process.env.ELECTRON_BUILDER_CACHE = cacheDir
process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||= 'https://npmmirror.com/mirrors/electron-builder-binaries/'
process.env.ELECTRON_MIRROR ||= 'https://npmmirror.com/mirrors/electron/'

const builderCli = path.join(rootDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
const child = spawn(process.execPath, [builderCli, '--win', target], {
  cwd: rootDir,
  env: process.env,
  stdio: 'inherit',
})

child.on('exit', (code) => process.exit(code ?? 1))
child.on('error', (error) => {
  console.error(error)
  process.exit(1)
})

const fs = require('node:fs')
const path = require('node:path')

const DEFAULT_SETTINGS = {
  mainBounds: null,
  floatingBounds: null,
  floatingAlwaysOnTop: false,
}

function createSettingsStore(userDataDir) {
  const settingsPath = path.join(userDataDir, 'settings.json')

  const read = () => {
    try {
      const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      return { ...DEFAULT_SETTINGS, ...stored }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  const write = (patch) => {
    const next = { ...read(), ...patch }
    fs.mkdirSync(userDataDir, { recursive: true })
    fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2), 'utf8')
    return next
  }

  return { read, write }
}

module.exports = { createSettingsStore }

const fs = require('node:fs')
const path = require('node:path')

function parseEnvFile(filePath) {
  try {
    const values = {}
    const source = fs.readFileSync(filePath, 'utf8')
    for (const line of source.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match) continue
      let value = match[2].trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      values[match[1]] = value
    }
    return values
  } catch {
    return {}
  }
}

function loadApiKeys(userDataDir) {
  const candidates = [
    path.join(userDataDir, '.env.local'),
    path.join(process.cwd(), '.env.local'),
    path.join(path.dirname(process.execPath), '.env.local'),
  ]

  const values = {}
  for (const candidate of candidates) {
    Object.assign(values, parseEnvFile(candidate))
  }

  const learners = process.env.MW_LEARNERS_API_KEY || values.MW_LEARNERS_API_KEY || ''
  const collegiate = process.env.MW_COLLEGIATE_API_KEY || values.MW_COLLEGIATE_API_KEY || ''
  return { learners, collegiate }
}

module.exports = { loadApiKeys }

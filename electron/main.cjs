const fs = require('node:fs')
const path = require('node:path')
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} = require('electron')
const { cancelCapture, captureRegion, registerCaptureIpc } = require('./capture.cjs')
const { loadApiKeys } = require('./env.cjs')
const { createSettingsStore } = require('./settings.cjs')
const { startRendererServer } = require('./server.cjs')

const APP_ID = 'com.lexicon.dictionary'
const RENDERER_PORT = 41730
const APP_ICON = path.join(__dirname, '..', 'build', 'icon.png')
const TRAY_ICON = path.join(__dirname, '..', 'build', 'tray.png')
const userDataDir = process.env.LEXICON_USER_DATA_DIR
  ? path.resolve(process.env.LEXICON_USER_DATA_DIR)
  : path.join(app.getPath('appData'), 'Lexicon')

fs.mkdirSync(userDataDir, { recursive: true })
app.setName('Lexicon')
app.setPath('userData', userDataDir)
app.setAppUserModelId(APP_ID)

let mainWindow = null
let floatingWindow = null
let tray = null
let rendererBaseUrl = ''
let rendererServer = null
let settings = null
let isQuitting = false
let mainBoundsTimer = null
let floatingBoundsTimer = null

function clampWindowBounds(bounds, fallback, minimum) {
  const width = Math.max(minimum.width, Math.round(Number(bounds?.width) || fallback.width))
  const height = Math.max(minimum.height, Math.round(Number(bounds?.height) || fallback.height))
  const primaryWorkArea = screen.getPrimaryDisplay().workArea
  const initialX = Number.isFinite(bounds?.x)
    ? bounds.x
    : primaryWorkArea.x + primaryWorkArea.width - width - 20
  const initialY = Number.isFinite(bounds?.y)
    ? bounds.y
    : primaryWorkArea.y + primaryWorkArea.height - height - 20
  const display = screen.getDisplayMatching({
    x: initialX,
    y: initialY,
    width,
    height,
  })
  const workArea = display.workArea
  const finalWidth = Math.min(width, workArea.width)
  const finalHeight = Math.min(height, workArea.height)
  return {
    width: finalWidth,
    height: finalHeight,
    x: Math.min(Math.max(Math.round(initialX), workArea.x), workArea.x + workArea.width - finalWidth),
    y: Math.min(Math.max(Math.round(initialY), workArea.y), workArea.y + workArea.height - finalHeight),
  }
}

function getMainBounds() {
  const fallback = { width: 1280, height: 860 }
  return clampWindowBounds(settings.read().mainBounds, fallback, { width: 900, height: 640 })
}

function getFloatingBounds() {
  const fallback = { width: 390, height: 640 }
  return clampWindowBounds(settings.read().floatingBounds, fallback, { width: 320, height: 420 })
}

function saveWindowBounds(key, browserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) return
  settings.write({ [key]: browserWindow.getBounds() })
}

function scheduleBoundsSave(key, browserWindow, timerName) {
  const timer = timerName === 'floating' ? 'floatingBoundsTimer' : 'mainBoundsTimer'
  if (timer === 'floatingBoundsTimer') clearTimeout(floatingBoundsTimer)
  else clearTimeout(mainBoundsTimer)

  const handle = setTimeout(() => saveWindowBounds(key, browserWindow), 350)
  if (timer === 'floatingBoundsTimer') floatingBoundsTimer = handle
  else mainBoundsTimer = handle
}

function openExternalUrl(url) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:') {
      void shell.openExternal(url)
    }
  } catch {}
}

function secureWebContents(browserWindow) {
  browserWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })

  browserWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const currentOrigin = new URL(browserWindow.webContents.getURL()).origin
      if (new URL(url).origin !== currentOrigin) {
        event.preventDefault()
        openExternalUrl(url)
      }
    } catch {
      event.preventDefault()
    }
  })
}

function windowWebPreferences() {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
  }
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow()
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    ...getMainBounds(),
    minWidth: 900,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f4f3ee',
    icon: APP_ICON,
    title: 'Lexicon',
    webPreferences: windowWebPreferences(),
  })

  secureWebContents(mainWindow)
  void mainWindow.loadURL(rendererBaseUrl)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('move', () => scheduleBoundsSave('mainBounds', mainWindow, 'main'))
  mainWindow.on('resize', () => scheduleBoundsSave('mainBounds', mainWindow, 'main'))
  mainWindow.on('close', (event) => {
    saveWindowBounds('mainBounds', mainWindow)
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  return mainWindow
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createFloatingWindow(initialQuery = '') {
  const stored = settings.read()
  floatingWindow = new BrowserWindow({
    ...getFloatingBounds(),
    minWidth: 320,
    minHeight: 420,
    show: false,
    frame: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    backgroundColor: '#f4f3ee',
    icon: APP_ICON,
    title: 'Lexicon 释义速查',
    alwaysOnTop: Boolean(stored.floatingAlwaysOnTop),
    webPreferences: windowWebPreferences(),
  })

  const params = new URLSearchParams({
    mode: 'float',
    pinned: stored.floatingAlwaysOnTop ? '1' : '0',
  })
  if (initialQuery) params.set('q', initialQuery)

  secureWebContents(floatingWindow)
  void floatingWindow.loadURL(`${rendererBaseUrl}?${params.toString()}`)
  floatingWindow.setAlwaysOnTop(Boolean(stored.floatingAlwaysOnTop), 'floating')
  floatingWindow.once('ready-to-show', () => {
    floatingWindow?.show()
    floatingWindow?.focus()
  })
  floatingWindow.on('move', () => scheduleBoundsSave('floatingBounds', floatingWindow, 'floating'))
  floatingWindow.on('resize', () => scheduleBoundsSave('floatingBounds', floatingWindow, 'floating'))
  floatingWindow.on('closed', () => {
    clearTimeout(floatingBoundsTimer)
    floatingWindow = null
  })
}

function openFloatingWindow(initialQuery = '') {
  const query = typeof initialQuery === 'string' ? initialQuery.slice(0, 8000) : ''
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    if (query) floatingWindow.webContents.send('floating:query', query)
    if (floatingWindow.isMinimized()) floatingWindow.restore()
    floatingWindow.show()
    floatingWindow.focus()
    return { pinned: floatingWindow.isAlwaysOnTop() }
  }

  createFloatingWindow(query)
  return { pinned: Boolean(settings.read().floatingAlwaysOnTop) }
}

function closeFloatingWindow() {
  if (!floatingWindow || floatingWindow.isDestroyed()) return
  saveWindowBounds('floatingBounds', floatingWindow)
  floatingWindow.close()
}

function openMainLookup(word) {
  if (typeof word !== 'string' || !word.trim()) return false
  showMainWindow()
  const send = () => mainWindow?.webContents.send('lookup:word', word)
  if (mainWindow.webContents.isLoading()) mainWindow.webContents.once('did-finish-load', send)
  else send()
  closeFloatingWindow()
  return true
}

function registerIpcHandlers() {
  registerCaptureIpc()
  ipcMain.handle('floating:open', (_event, query) => openFloatingWindow(query))
  ipcMain.handle('floating:close', (event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== floatingWindow) return false
    closeFloatingWindow()
    return true
  })
  ipcMain.handle('floating:get-state', () => ({
    pinned: Boolean(floatingWindow && !floatingWindow.isDestroyed() && floatingWindow.isAlwaysOnTop()),
  }))
  ipcMain.handle('floating:toggle-pin', (event) => {
    if (BrowserWindow.fromWebContents(event.sender) !== floatingWindow) return false
    const next = !floatingWindow.isAlwaysOnTop()
    floatingWindow.setAlwaysOnTop(next, 'floating')
    settings.write({ floatingAlwaysOnTop: next })
    return next
  })
  ipcMain.handle('main:lookup', (_event, word) => openMainLookup(word))
  ipcMain.handle('capture:select-region', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner || owner !== floatingWindow) return { canceled: true }
    try {
      return await captureRegion(owner)
    } catch {
      return { canceled: false, error: '截图失败，请重试' }
    }
  })
}

function createTray() {
  const icon = nativeImage.createFromPath(TRAY_ICON)
  tray = new Tray(icon.isEmpty() ? nativeImage.createFromPath(APP_ICON).resize({ width: 16, height: 16 }) : icon)
  tray.setToolTip('Lexicon 私人英语词典')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示词典', click: showMainWindow },
    { label: '打开释义速查', click: () => openFloatingWindow('') },
    { type: 'separator' },
    {
      label: '退出 Lexicon',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ]))
  tray.on('double-click', showMainWindow)
}

async function resolveRendererBaseUrl(apiKeys) {
  if (app.isPackaged) {
    const distDir = path.join(app.getAppPath(), 'dist')
    try {
      rendererServer = await startRendererServer({ distDir, apiKeys, port: RENDERER_PORT })
    } catch {
      rendererServer = await startRendererServer({ distDir, apiKeys })
    }
    return `http://127.0.0.1:${rendererServer.port}/`
  }

  const devUrl = `${(process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173').replace(/\/$/, '')}/`
  try {
    const response = await fetch(devUrl, { signal: AbortSignal.timeout(2000) })
    if (response.ok) return devUrl
  } catch {}

  const distDir = path.join(app.getAppPath(), 'dist')
  if (fs.existsSync(path.join(distDir, 'index.html'))) {
    try {
      rendererServer = await startRendererServer({ distDir, apiKeys, port: RENDERER_PORT })
    } catch {
      rendererServer = await startRendererServer({ distDir, apiKeys })
    }
    return `http://127.0.0.1:${rendererServer.port}/`
  }
  return devUrl
}

async function bootstrap() {
  settings = createSettingsStore(userDataDir)
  const apiKeys = loadApiKeys(userDataDir)
  rendererBaseUrl = await resolveRendererBaseUrl(apiKeys)

  Menu.setApplicationMenu(null)
  registerIpcHandlers()
  createTray()
  createMainWindow()

  const registered = globalShortcut.register('CommandOrControl+Shift+D', () => openFloatingWindow(''))
  if (!registered) console.warn('Unable to register the Ctrl+Shift+D shortcut.')
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', showMainWindow)
  app.on('activate', showMainWindow)
  app.on('before-quit', () => {
    isQuitting = true
    cancelCapture()
    clearTimeout(mainBoundsTimer)
    clearTimeout(floatingBoundsTimer)
    if (mainWindow && !mainWindow.isDestroyed()) saveWindowBounds('mainBounds', mainWindow)
    if (floatingWindow && !floatingWindow.isDestroyed()) saveWindowBounds('floatingBounds', floatingWindow)
  })
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    if (rendererServer) void rendererServer.close()
  })
  app.on('window-all-closed', () => {})
  app.whenReady()
    .then(bootstrap)
    .catch((error) => {
      console.error(error)
      app.quit()
    })
}

const { BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron')
const path = require('node:path')

const OVERLAY_HTML = path.join(__dirname, 'capture-overlay.html')
const OVERLAY_PRELOAD = path.join(__dirname, 'capture-preload.cjs')

let activeSession = null
let ipcRegistered = false
let sessionCounter = 0

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function findEntry(sender) {
  if (!activeSession) return null
  return activeSession.entries.find((entry) => (
    !entry.window.isDestroyed() && entry.window.webContents === sender
  )) || null
}

function restoreOwner(session) {
  const owner = session.owner
  if (!owner || owner.isDestroyed()) return
  if (session.ownerWasVisible) owner.show()
  owner.focus()
}

function finishSession(result) {
  const session = activeSession
  if (!session) return
  activeSession = null
  session.finishing = true

  for (const entry of session.entries) {
    if (!entry.window.isDestroyed()) entry.window.close()
  }

  restoreOwner(session)
  session.resolve(result)
}

function cancelCapture() {
  finishSession({ canceled: true })
}

function cropEntry(entry, rect) {
  if (!entry || !rect) return null
  const values = [rect.x, rect.y, rect.width, rect.height].map(Number)
  if (values.some((value) => !Number.isFinite(value))) return null
  if (values[2] < 1 || values[3] < 1) return null

  const [contentWidth, contentHeight] = entry.window.getContentSize()
  const imageWidth = entry.imageSize.width
  const imageHeight = entry.imageSize.height
  if (!contentWidth || !contentHeight || !imageWidth || !imageHeight) return null

  const scaleX = imageWidth / contentWidth
  const scaleY = imageHeight / contentHeight
  const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum)
  const left = clamp(Math.round(values[0] * scaleX), 0, imageWidth - 1)
  const top = clamp(Math.round(values[1] * scaleY), 0, imageHeight - 1)
  const right = clamp(Math.round((values[0] + values[2]) * scaleX), left + 1, imageWidth)
  const bottom = clamp(Math.round((values[1] + values[3]) * scaleY), top + 1, imageHeight)
  const width = right - left
  const height = bottom - top
  if (width < 2 || height < 2) return null

  const cropped = entry.source.thumbnail.crop({ x: left, y: top, width, height })
  if (cropped.isEmpty()) return null
  return {
    dataUrl: cropped.toDataURL(),
    width,
    height,
  }
}

function registerCaptureIpc() {
  if (ipcRegistered) return
  ipcRegistered = true

  ipcMain.on('capture-overlay:ready', (event) => {
    const entry = findEntry(event.sender)
    if (!entry || entry.window.isDestroyed()) return
    entry.ready = true
    entry.window.show()
    entry.window.focus()
  })

  ipcMain.on('capture-overlay:select', (event, rect) => {
    const entry = findEntry(event.sender)
    if (!entry) return
    const result = cropEntry(entry, rect)
    if (!result) {
      finishSession({ canceled: false, error: '无法截取所选区域' })
      return
    }
    finishSession({ canceled: false, ...result })
  })

  ipcMain.on('capture-overlay:cancel', (event) => {
    if (findEntry(event.sender)) finishSession({ canceled: true })
  })
}

function createOverlay(session, entry) {
  const { bounds } = entry.display
  const overlay = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: false,
    backgroundColor: '#0b0d0c',
    show: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    thickFrame: false,
    focusable: true,
    webPreferences: {
      preload: OVERLAY_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  entry.window = overlay
  overlay.setAlwaysOnTop(true, 'screen-saver')
  if (typeof overlay.setVisibleOnAllWorkspaces === 'function') {
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  }

  overlay.on('closed', () => {
    if (activeSession?.id === session.id && !session.finishing) {
      finishSession({ canceled: true })
    }
  })

  overlay.webContents.once('did-finish-load', () => {
    if (overlay.isDestroyed()) return
    overlay.webContents.send('capture-overlay:init', {
      dataUrl: entry.source.thumbnail.toDataURL(),
      width: bounds.width,
      height: bounds.height,
    })
  })

  void overlay.loadFile(OVERLAY_HTML)
}

async function captureRegion(owner) {
  if (activeSession) finishSession({ canceled: true })
  await wait(60)

  const ownerWasVisible = Boolean(owner && !owner.isDestroyed() && owner.isVisible())
  if (owner && !owner.isDestroyed()) owner.hide()
  await wait(180)

  try {
    const displays = screen.getAllDisplays().filter((display) => (
      display.bounds.width > 0 && display.bounds.height > 0
    ))
    if (!displays.length) throw new Error('No display available')

    const maxWidth = Math.max(...displays.map((display) => Math.round(display.bounds.width * display.scaleFactor)))
    const maxHeight = Math.max(...displays.map((display) => Math.round(display.bounds.height * display.scaleFactor)))
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: maxWidth, height: maxHeight },
      fetchWindowIcons: false,
    })

    const usedSourceIds = new Set()
    const entries = []
    for (const [index, display] of displays.entries()) {
      let source = sources.find((item) => (
        item.display_id && String(item.display_id) === String(display.id)
      ))
      if (!source) source = sources.find((item) => !usedSourceIds.has(item.id)) || sources[index]
      if (!source || source.thumbnail.isEmpty()) continue
      usedSourceIds.add(source.id)
      entries.push({
        display,
        source,
        imageSize: source.thumbnail.getSize(),
        window: null,
        ready: false,
      })
    }

    if (!entries.length) throw new Error('No screen source available')

    return await new Promise((resolve) => {
      const session = {
        id: ++sessionCounter,
        owner,
        ownerWasVisible,
        entries,
        resolve,
        finishing: false,
      }
      activeSession = session

      for (const entry of entries) createOverlay(session, entry)

      setTimeout(() => {
        if (activeSession?.id !== session.id) return
        for (const entry of session.entries) {
          if (!entry.window.isDestroyed() && !entry.ready) entry.window.show()
        }
      }, 600)
    })
  } catch (error) {
    if (owner && !owner.isDestroyed()) {
      if (ownerWasVisible) owner.show()
      owner.focus()
    }
    throw error
  }
}

module.exports = {
  cancelCapture,
  captureRegion,
  registerCaptureIpc,
}

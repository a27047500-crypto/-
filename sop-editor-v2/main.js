/**
 * main.js — Electron 主进程
 * 负责：窗口管理 / 文件 I/O / 菜单 / 自动保存 / Tailwind 缓存
 */
const { app, BrowserWindow, ipcMain, Menu, dialog, shell, net } = require('electron')
const path  = require('path')
const fs    = require('fs')

// ── 单例锁 ────────────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0) }

// ── 路径常量 ──────────────────────────────────────────────────────────────
const USER_DATA      = app.getPath('userData')
const RECENT_FILE    = path.join(USER_DATA, 'recent.json')
const TW_CACHE       = path.join(USER_DATA, 'tailwind-cache.js')
const TW_CDN         = 'https://cdn.tailwindcss.com'
const AUTOSAVE_FILE  = path.join(USER_DATA, 'autosave.sopx')
const MAX_RECENT     = 12

let mainWindow  = null
let currentFile = null   // 当前打开的文件路径
let isDirty     = false  // 是否有未保存的修改

// ── 工具函数 ──────────────────────────────────────────────────────────────
function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return fallback }
}
function writeJSON(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
}
function getRecent() { return readJSON(RECENT_FILE, []) }
function addRecent(fp) {
  let list = getRecent().filter(x => x !== fp)
  list.unshift(fp)
  writeJSON(RECENT_FILE, list.slice(0, MAX_RECENT))
}

// ── Tailwind CSS 离线缓存 ─────────────────────────────────────────────────
async function ensureTailwindCache() {
  if (fs.existsSync(TW_CACHE)) return   // 已缓存，跳过
  try {
    const res = await net.fetch(TW_CDN)
    const js  = await res.text()
    fs.mkdirSync(path.dirname(TW_CACHE), { recursive: true })
    fs.writeFileSync(TW_CACHE, js, 'utf8')
    console.log('[Tailwind] CDN 已缓存到本地:', TW_CACHE)
  } catch (e) {
    console.warn('[Tailwind] 无法缓存，将使用 CDN:', e.message)
  }
}

// ── 窗口标题更新 ──────────────────────────────────────────────────────────
function updateTitle() {
  if (!mainWindow) return
  const name = currentFile ? path.basename(currentFile, '.sopx') : '未命名文档'
  const dot  = isDirty ? ' ●' : ''
  mainWindow.setTitle(`${name}${dot} — 流程文件编辑器`)
}

// ── 文件操作 ──────────────────────────────────────────────────────────────
function sopxRead(fp) {
  const raw = fs.readFileSync(fp, 'utf8')
  return JSON.parse(raw)
}
function sopxWrite(fp, payload) {
  fs.mkdirSync(path.dirname(fp), { recursive: true })
  fs.writeFileSync(fp, JSON.stringify(payload, null, 2), 'utf8')
}

async function doOpen(fp) {
  try {
    const data = sopxRead(fp)
    addRecent(fp)
    currentFile = fp
    isDirty = false
    updateTitle()
    mainWindow.webContents.send('file:opened', { path: fp, data })
    buildMenu()
    return { ok: true }
  } catch (e) {
    dialog.showErrorBox('打开失败', e.message)
    return { ok: false, error: e.message }
  }
}

async function doSave(payload, fp) {
  try {
    sopxWrite(fp, { version: 2, savedAt: new Date().toISOString(), ...payload })
    addRecent(fp)
    currentFile = fp
    isDirty = false
    updateTitle()
    buildMenu()
    return { ok: true, path: fp }
  } catch (e) {
    dialog.showErrorBox('保存失败', e.message)
    return { ok: false, error: e.message }
  }
}

// ── IPC 处理器 ────────────────────────────────────────────────────────────
ipcMain.handle('app:version', () => app.getVersion())
ipcMain.handle('app:about',   () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info', title: '关于',
    message: '流程文件专业编辑器 v' + app.getVersion(),
    detail: '深圳市昊一源科技有限公司\n\n数据保存至本地 .sopx 文件，完全离线可用。',
    buttons: ['确定']
  })
})

ipcMain.handle('file:getRecent', () => {
  return getRecent().filter(fp => fs.existsSync(fp))
})

ipcMain.handle('file:new', async () => {
  // 若有未保存修改，询问是否先保存
  if (isDirty) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['保存', '不保存', '取消'],
      message: '当前文档有未保存的修改，是否先保存？'
    })
    if (response === 0) await ipcMain.emit('file:save-current')
    if (response === 2) return { ok: false }
  }
  currentFile = null; isDirty = false
  updateTitle(); buildMenu()
  return { ok: true }
})

ipcMain.handle('file:open', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: '打开流程文件',
    filters: [{ name: '流程文件', extensions: ['sopx'] }, { name: '所有文件', extensions: ['*'] }],
    properties: ['openFile']
  })
  if (canceled || !filePaths[0]) return { ok: false }
  return doOpen(filePaths[0])
})

ipcMain.handle('file:openPath', (_, fp) => doOpen(fp))

ipcMain.handle('file:save', async (_, payload) => {
  isDirty = true
  // 自动保存到临时文件
  try { sopxWrite(AUTOSAVE_FILE, { version: 2, ...payload }) } catch {}
  if (!currentFile) return ipcMain.handle['file:saveAs'](_, payload)
  return doSave(payload, currentFile)
})

ipcMain.handle('file:saveAs', async (_, payload) => {
  const docNo = payload?.docNo || '未命名文档'
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '保存流程文件',
    defaultPath: `${docNo}.sopx`,
    filters: [{ name: '流程文件', extensions: ['sopx'] }]
  })
  if (canceled || !filePath) return { ok: false }
  return doSave(payload, filePath)
})

ipcMain.handle('export:json', async (_, data, name) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出 JSON 数据',
    defaultPath: `${name || '流程文件'}_备份.json`,
    filters: [{ name: 'JSON 文件', extensions: ['json'] }]
  })
  if (canceled || !filePath) return { ok: false }
  fs.writeFileSync(filePath, JSON.stringify({ version: 2, ...data }, null, 2), 'utf8')
  shell.showItemInFolder(filePath)
  return { ok: true, path: filePath }
})

ipcMain.handle('export:html', async (_, html, name) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: '导出独立 HTML',
    defaultPath: `${name || '流程文件'}.html`,
    filters: [{ name: 'HTML 文件', extensions: ['html'] }]
  })
  if (canceled || !filePath) return { ok: false }
  fs.writeFileSync(filePath, html, 'utf8')
  shell.showItemInFolder(filePath)
  return { ok: true, path: filePath }
})

ipcMain.handle('asset:tailwind', () => {
  if (fs.existsSync(TW_CACHE)) return fs.readFileSync(TW_CACHE, 'utf8')
  return null  // null = 让前端回退到 CDN
})

// ── PDF 打印预览（生成 PDF → 用系统查看器打开）────────────────────────────
ipcMain.handle('print-to-pdf', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender)
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'printableArea' }
    })
    const tmpPath = path.join(app.getPath('temp'), `SOP_Preview_${Date.now()}.pdf`)
    fs.writeFileSync(tmpPath, pdf)
    await shell.openPath(tmpPath)
    return { ok: true, path: tmpPath }
  } catch (e) {
    return { ok: false, error: e.message }
  }
})

// ── 标记脏状态（由渲染进程调用） ──────────────────────────────────────────
ipcMain.on('doc:dirty', (_, dirty) => {
  isDirty = dirty; updateTitle()
})

// ── 应用菜单 ──────────────────────────────────────────────────────────────
function buildMenu() {
  const recent = getRecent().filter(fp => fs.existsSync(fp))
  const recentItems = recent.length
    ? recent.slice(0, 8).map(fp => ({
        label: path.basename(fp, '.sopx'),
        click: () => doOpen(fp)
      }))
    : [{ label: '（无最近文件）', enabled: false }]

  const template = [
    {
      label: '文件',
      submenu: [
        { label: '新建文档',   accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:action', 'new') },
        { label: '打开文档…',  accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu:action', 'open') },
        { label: '最近文件',   submenu: recentItems },
        { type: 'separator' },
        { label: '保存',       accelerator: 'CmdOrCtrl+S',       click: () => mainWindow?.webContents.send('menu:action', 'save') },
        { label: '另存为…',    accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow?.webContents.send('menu:action', 'saveAs') },
        { type: 'separator' },
        { label: '导出 PDF',             accelerator: 'CmdOrCtrl+P', click: () => mainWindow?.webContents.send('menu:action', 'exportPDF') },
        { label: '导出 JSON 数据备份',                              click: () => mainWindow?.webContents.send('menu:action', 'exportJSON') },
        { label: '导出独立 HTML 文件',                              click: () => mainWindow?.webContents.send('menu:action', 'exportHTML') },
        { type: 'separator' },
        { label: '退出', accelerator: 'Alt+F4', click: () => app.quit() }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' }, { label: '复制', role: 'copy' }, { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '放大', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '重置缩放', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' },
        { label: '开发者工具', accelerator: 'F12', click: () => mainWindow?.webContents.toggleDevTools() }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: '关于', click: () => ipcMain.emit('app:about') },
        { label: '打开数据目录', click: () => shell.openPath(USER_DATA) }
      ]
    }
  ]

  if (process.platform === 'darwin') {
    template.unshift({ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ── 创建主窗口 ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480, height: 920, minWidth: 1100, minHeight: 680,
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    }
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  mainWindow.once('ready-to-show', () => { mainWindow.show(); mainWindow.focus() })

  // 外链在系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url); return { action: 'deny' }
  })

  // 关闭前确认
  mainWindow.on('close', async (e) => {
    if (!isDirty) return
    e.preventDefault()
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['保存并退出', '不保存直接退出', '取消'],
      defaultId: 0, cancelId: 2,
      message: '文档有未保存的修改',
      detail: '退出前是否保存？'
    })
    if (response === 0) { mainWindow.webContents.send('menu:action', 'save'); setTimeout(() => app.quit(), 800) }
    else if (response === 1) { isDirty = false; app.quit() }
  })
}

// ── 应用启动 ──────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await ensureTailwindCache()
  createWindow()
  buildMenu()
})

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

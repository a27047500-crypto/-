const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// 防止多实例运行
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '流程文件编辑器',
    icon: path.join(__dirname, 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,         // 允许加载本地资源
      allowRunningInsecureContent: false,
      preload: undefined
    },
    backgroundColor: '#f1f5f9',
    show: false,                  // 内容加载完再显示，避免白屏闪烁
  })

  // 加载编辑器 HTML
  mainWindow.loadFile('index.html')

  // 内容加载完毕后显示窗口
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  // 处理外部链接：在系统浏览器中打开，而非在应用内
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 标题栏显示文档编号（来自页面内 title 更新事件）
  mainWindow.webContents.on('page-title-updated', (event, title) => {
    mainWindow.setTitle('流程文件编辑器 — ' + title)
  })

  // 开发模式可取消注释以打开 DevTools
  // mainWindow.webContents.openDevTools()
}

// ==================== 菜单配置 ====================
function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        {
          label: '导出 PDF',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.executeJavaScript('window.printPreCheck && window.printPreCheck()')
        },
        {
          label: '导出数据 (JSON)',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow?.webContents.executeJavaScript('window.exportJSON && window.exportJSON()')
        },
        {
          label: '恢复数据 (JSON)',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.executeJavaScript('document.getElementById("import-json-input")?.click()')
        },
        { type: 'separator' },
        {
          label: '暂存草稿',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow?.webContents.executeJavaScript('window.saveDraft && window.saveDraft()')
        },
        {
          label: '打开草稿箱',
          click: () => mainWindow?.webContents.executeJavaScript('window.openDraftModal && window.openDraftModal()')
        },
        { type: 'separator' },
        {
          label: '保存独立 HTML 文件',
          click: () => mainWindow?.webContents.executeJavaScript('window.exportSnapshot && window.exportSnapshot()')
        },
        { type: 'separator' },
        {
          label: '退出',
          accelerator: process.platform === 'darwin' ? 'Command+Q' : 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: '重做', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: '复制', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: '粘贴', accelerator: 'CmdOrCtrl+V', role: 'paste' },
        { label: '全选', accelerator: 'CmdOrCtrl+A', role: 'selectAll' }
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
        { type: 'separator' },
        { label: '生成目录', click: () => mainWindow?.webContents.executeJavaScript('window.updateTOC && window.updateTOC()') }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '使用说明',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '使用说明',
              message: '流程文件编辑器',
              detail: [
                '📝 基本操作',
                '  • 点击任意文字区域即可直接编辑',
                '  • 选中文字后可调整格式（顶部浮动工具栏）',
                '',
                '💾 保存方式',
                '  • Ctrl+S → 导出 JSON 数据备份',
                '  • Ctrl+Shift+S → 暂存草稿（本地）',
                '  • 保存独立 HTML → 可发给他人查看',
                '',
                '🖨️ 打印/导出PDF',
                '  • Ctrl+P 或点击右侧"导出 PDF"按钮',
                '  • 建议使用 Chrome/Edge 浏览器打印',
                '',
                '📌 草稿跨电脑使用',
                '  • 先导出草稿文件，再到新电脑导入'
              ].join('\n'),
              buttons: ['知道了']
            })
          }
        },
        {
          label: '关于',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '关于',
              message: '流程文件编辑器',
              detail: `版本：${app.getVersion()}\n平台：${process.platform}\n深圳市昊一源科技有限公司`,
              buttons: ['确定'],
              icon: path.join(__dirname, 'build', 'icon.png')
            })
          }
        }
      ]
    }
  ]

  // macOS 专属菜单调整
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ==================== 应用生命周期 ====================
app.whenReady().then(() => {
  createWindow()
  buildMenu()
})

// 第二个实例启动时，聚焦已有窗口
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

// macOS：点击 Dock 图标时重新创建窗口
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// Windows/Linux：关闭所有窗口后退出
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// 关闭前询问是否保存（可选，避免误关丢失内容）
app.on('before-quit', (e) => {
  // 如有需要可在此添加"是否保存"确认逻辑
})

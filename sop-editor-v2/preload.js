/**
 * preload.js — 安全地将主进程 API 暴露给渲染进程
 * 所有文件操作、系统对话框均通过此桥接层调用
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('sopAPI', {
  // ── 文件操作 ──────────────────────────────────────────────
  newFile:    ()           => ipcRenderer.invoke('file:new'),
  openFile:   ()           => ipcRenderer.invoke('file:open'),
  saveFile:   (data)       => ipcRenderer.invoke('file:save', data),
  saveFileAs: (data)       => ipcRenderer.invoke('file:saveAs', data),
  getRecent:  ()           => ipcRenderer.invoke('file:getRecent'),
  openPath:   (p)          => ipcRenderer.invoke('file:openPath', p),

  // ── 导出 ──────────────────────────────────────────────────
  exportJSON: (data, name) => ipcRenderer.invoke('export:json', data, name),
  exportHTML: (html, name) => ipcRenderer.invoke('export:html', html, name),

  // ── 应用信息 ──────────────────────────────────────────────
  getVersion: ()           => ipcRenderer.invoke('app:version'),
  showAbout:  ()           => ipcRenderer.invoke('app:about'),

  // ── 主进程 → 渲染进程 事件监听 ────────────────────────────
  onMenuAction: (cb)       => ipcRenderer.on('menu:action', (_, action) => cb(action)),
  onFileOpened: (cb)       => ipcRenderer.on('file:opened',  (_, data)   => cb(data)),

  // ── Tailwind CSS 离线缓存 ─────────────────────────────────
  getTailwindCSS: ()       => ipcRenderer.invoke('asset:tailwind'),

  // ── PDF 打印预览 ──────────────────────────────────────────
  printToPDF:    ()        => ipcRenderer.invoke('print-to-pdf'),
})

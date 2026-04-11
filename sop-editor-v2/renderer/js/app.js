/**
 * app.js — 渲染进程主逻辑
 * 负责：文件操作桥接 / 侧边栏 / 状态栏 / 大纲生成 / 自动保存
 */
'use strict';

// ── Tailwind 离线加载 ────────────────────────────────────────────────────
(async function loadTailwind() {
  if (!window.sopAPI) return  // 非 Electron 环境跳过
  try {
    const cached = await window.sopAPI.getTailwindCSS()
    if (cached) {
      const s = document.createElement('script')
      s.textContent = cached
      document.head.appendChild(s)
      console.log('[Tailwind] 已从本地缓存加载')
      return
    }
  } catch {}
  // 回退：动态加载 CDN（联网时）
  const s = document.createElement('script')
  s.src = 'https://cdn.tailwindcss.com'
  document.head.appendChild(s)
  console.log('[Tailwind] 使用 CDN 加载')
})()

// ── 全局状态 ──────────────────────────────────────────────────────────────
const State = {
  currentFile:    null,
  isDirty:        false,
  autoSaveTimer:  null,
  pageCount:      0,
  sidebarTab:     'outline',   // 'outline' | 'recent'
  sidebarCollapsed: false,
}

// ── DOM 引用 ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const $$ = sel => document.querySelectorAll(sel)

// ── 工具函数 ──────────────────────────────────────────────────────────────
function toast(msg, type = 'info', dur = 3000) {
  const wrap = $('toast-wrap')
  const el   = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = msg
  wrap.appendChild(el)
  requestAnimationFrame(() => el.classList.add('show'))
  setTimeout(() => {
    el.classList.remove('show')
    setTimeout(() => el.remove(), 300)
  }, dur)
}

function setTitle(filename, dirty) {
  const fname = $('toolbar-fname')
  const dot   = $('toolbar-save-dot')
  if (fname) fname.textContent = filename || '未命名文档'
  if (dot)   dot.classList.toggle('saved', !dirty)
  if (dot)   dot.title = dirty ? '有未保存的修改' : '已保存'
}

function markDirty(dirty = true) {
  State.isDirty = dirty
  setTitle(State.currentFile ? getBaseName(State.currentFile) : '未命名文档', dirty)
  if (window.sopAPI) window.sopAPI && ipcRenderer_dirty(dirty)
  restartAutoSave()
}

function ipcRenderer_dirty(dirty) {
  // 通知主进程文档状态
  try { window.sopAPI && window.electron && window.electron.ipcRenderer.send('doc:dirty', dirty) } catch {}
}

function getBaseName(fp) {
  if (!fp) return '未命名文档'
  return fp.replace(/\\/g, '/').split('/').pop().replace(/\.sopx$/, '')
}

// ── 获取文档 HTML 内容 ────────────────────────────────────────────────────
function getDocumentHTML() {
  const wrapper = $('document-wrapper')
  if (!wrapper) return ''
  // 清理工具按钮，保留纯内容
  const clone = wrapper.cloneNode(true)
  clone.querySelectorAll(
    '.block-toolbar,.table-controls,.sipoc-action-bar,.rich-toolbar,.delete-btn-wrapper,.no-print'
  ).forEach(el => el.remove())
  return clone.innerHTML
}

function getDocNo() {
  const el = $('main-doc-no')
  return el ? el.innerText.trim() : '未命名'
}

// ── 文件操作 ──────────────────────────────────────────────────────────────
async function doNew() {
  if (!window.sopAPI) { toast('仅 Electron 版本支持此操作', 'warn'); return }
  if (State.isDirty) {
    if (!confirm('当前文档有未保存的修改，确定新建吗？')) return
  }
  const res = await window.sopAPI.newFile()
  if (!res.ok) return
  // 重置文档内容
  const wrapper = $('document-wrapper')
  if (wrapper && window._INITIAL_DOC_HTML) wrapper.innerHTML = window._INITIAL_DOC_HTML
  State.currentFile = null
  markDirty(false)
  setTitle('未命名文档', false)
  updateStatusBar()
  updateOutline()
  toast('新文档已创建', 'success')
}

async function doOpen() {
  if (!window.sopAPI) { toast('仅 Electron 版本支持此操作', 'warn'); return }
  await window.sopAPI.openFile()
  // 结果通过 onFileOpened 事件处理
}

async function doOpenPath(fp) {
  if (!window.sopAPI) return
  await window.sopAPI.openPath(fp)
}

async function doSave() {
  if (!window.sopAPI) {
    // 降级：触发浏览器下载 JSON
    window.exportJSON && window.exportJSON()
    return
  }
  const html  = getDocumentHTML()
  const docNo = getDocNo()
  const payload = { html, docNo, title: document.title }
  let res
  if (State.currentFile) {
    res = await window.sopAPI.saveFile(payload)
  } else {
    res = await window.sopAPI.saveFileAs(payload)
  }
  if (res && res.ok) {
    State.currentFile = res.path
    markDirty(false)
    setTitle(getBaseName(res.path), false)
    toast('✅ 已保存：' + getBaseName(res.path), 'success')
    updateStatusBar()
  }
}

async function doSaveAs() {
  if (!window.sopAPI) { toast('仅 Electron 版本支持此操作', 'warn'); return }
  const html  = getDocumentHTML()
  const docNo = getDocNo()
  const res   = await window.sopAPI.saveFileAs({ html, docNo })
  if (res && res.ok) {
    State.currentFile = res.path
    markDirty(false)
    setTitle(getBaseName(res.path), false)
    toast('✅ 另存为：' + getBaseName(res.path), 'success')
  }
}

async function doExportJSON() {
  if (!window.sopAPI) { window.exportJSON && window.exportJSON(); return }
  const html  = getDocumentHTML()
  const docNo = getDocNo()
  const res = await window.sopAPI.exportJSON({ html, version: 2 }, docNo)
  if (res && res.ok) toast('✅ JSON 备份已导出', 'success')
}

async function doExportHTML() {
  if (!window.sopAPI) { window.exportSnapshot && window.exportSnapshot(); return }
  // 生成完整独立 HTML（含所有样式和脚本）
  const full = '<!DOCTYPE html>\n' + document.documentElement.outerHTML
  const docNo = getDocNo()
  const res = await window.sopAPI.exportHTML(full, docNo)
  if (res && res.ok) toast('✅ 独立 HTML 已导出', 'success')
}

async function doExportPDF() {
  // 准备文档状态（隐藏工具栏、重算分页等）
  if (window.clearTableSelection) window.clearTableSelection()
  if (window.recalculatePages)    window.recalculatePages()
  if (window.recalcParaNumbers)   window.recalcParaNumbers()
  if (window.bakeTableWidths)     window.bakeTableWidths()
  if (window.fixFlowchartState)   window.fixFlowchartState()

  if (window.sopAPI && window.sopAPI.printToPDF) {
    toast('正在生成 PDF，请稍候…')
    const res = await window.sopAPI.printToPDF()
    if (res && res.ok) {
      toast('✅ PDF 已生成，正在用系统查看器打开预览')
    } else {
      toast('PDF 生成失败，改用打印对话框')
      window.print()
    }
  } else {
    window.printPreCheck ? window.printPreCheck() : window.print()
  }
}

// ── 文件打开事件（主进程发送） ────────────────────────────────────────────
function onFileOpened({ path: fp, data }) {
  const wrapper = $('document-wrapper')
  if (!wrapper) return
  if (data && data.html) {
    // 升级旧 DOM
    wrapper.innerHTML = data.html
    if (window.upgradeLiveDOM)   window.upgradeLiveDOM()
    if (window.recalcParaNumbers) window.recalcParaNumbers()
    if (window.recalcSipocNumbers) window.recalcSipocNumbers()
    if (window.fixFlowchartState) window.fixFlowchartState()
    if (window.applyVisualMerge) window.applyVisualMerge()
    if (window.reattachCommentHandlers) window.reattachCommentHandlers()
  }
  State.currentFile = fp
  markDirty(false)
  setTitle(getBaseName(fp), false)
  updateStatusBar()
  updateOutline()
  loadRecentList()
  toast('✅ 已打开：' + getBaseName(fp), 'success')
}

// ── 自动保存 ─────────────────────────────────────────────────────────────
function restartAutoSave() {
  clearTimeout(State.autoSaveTimer)
  if (!State.isDirty) return
  State.autoSaveTimer = setTimeout(async () => {
    if (!State.isDirty || !window.sopAPI) return
    const html  = getDocumentHTML()
    const docNo = getDocNo()
    await window.sopAPI.saveFile({ html, docNo, auto: true })
    updateStatusBar({ lastSaved: new Date() })
  }, 30000)  // 30 秒
}

// ── 大纲生成 ──────────────────────────────────────────────────────────────
function updateOutline() {
  const panel = $('outline-panel')
  if (!panel) return
  panel.innerHTML = ''

  // 封面
  const coverItem = document.createElement('div')
  coverItem.className = 'outline-item cover'
  coverItem.innerHTML = `<span class="num">封</span><span>封面</span>`
  coverItem.onclick = () => scrollToPage('page-cover')
  panel.appendChild(coverItem)

  // 遍历所有 section-title
  $$('.a4-page, .a4-page-landscape').forEach((page, pi) => {
    page.querySelectorAll('h2.section-title').forEach(h2 => {
      const numEl  = h2.querySelector('.section-num')
      const textEl = h2.querySelector('span:not(.section-num)')
      const num    = numEl ? numEl.innerText.trim() : ''
      const text   = textEl ? textEl.innerText.trim() : ''
      if (!text) return

      const item = document.createElement('div')
      item.className = 'outline-item'
      item.innerHTML = `<span class="num">${num}</span><span>${text}</span>`
      item.onclick = () => {
        h2.scrollIntoView({ behavior: 'smooth', block: 'start' })
        $$('.outline-item').forEach(i => i.classList.remove('active'))
        item.classList.add('active')
      }
      panel.appendChild(item)
    })
  })

  // 更新页数
  const pages = $$('.a4-page, .a4-page-landscape').length
  State.pageCount = pages
  const sbPages = $('sb-pages')
  if (sbPages) sbPages.textContent = `共 ${pages} 页`
}

function scrollToPage(id) {
  const el = $(id) || $$('.a4-page')[0]
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// ── 最近文件列表 ──────────────────────────────────────────────────────────
async function loadRecentList() {
  if (!window.sopAPI) return
  const recent = await window.sopAPI.getRecent()
  const panel  = $('recent-panel')
  if (!panel) return
  panel.innerHTML = ''

  if (!recent.length) {
    panel.innerHTML = '<div class="recent-empty">暂无最近文件<br>保存文档后会显示在这里</div>'
    return
  }

  recent.forEach(fp => {
    const name = fp.replace(/\\/g,'/').split('/').pop().replace(/\.sopx$/,'')
    const dir  = fp.replace(/\\/g,'/').split('/').slice(0,-1).join('/')
    const item = document.createElement('div')
    item.className = 'recent-item'
    item.innerHTML = `
      <svg class="ri-icon" width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/>
      </svg>
      <div class="ri-info">
        <div class="ri-name">${name}</div>
        <div class="ri-path">${dir}</div>
      </div>`
    item.onclick = () => doOpenPath(fp)
    panel.appendChild(item)
  })

  // 同步更新欢迎屏
  renderWelcomeRecent(recent)
}

// ── 欢迎屏最近文件 ────────────────────────────────────────────────────────
function renderWelcomeRecent(recent) {
  const wrap = $('welcome-recent-list')
  if (!wrap) return
  wrap.innerHTML = ''
  if (!recent.length) { $('welcome-recent-section') && ($('welcome-recent-section').style.display = 'none'); return }
  recent.slice(0, 5).forEach(fp => {
    const name = fp.replace(/\\/g,'/').split('/').pop().replace(/\.sopx$/,'')
    const el   = document.createElement('div')
    el.className = 'welcome-recent-item'
    el.innerHTML = `
      <svg width="18" height="18" fill="none" stroke="#2563eb" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z"/>
      </svg>
      <div>
        <div class="name">${name}</div>
        <div class="meta">${fp}</div>
      </div>`
    el.onclick = () => doOpenPath(fp)
    wrap.appendChild(el)
  })
}

// ── 状态栏更新 ────────────────────────────────────────────────────────────
function updateStatusBar({ lastSaved } = {}) {
  const sbFile  = $('sb-file')
  const sbPages = $('sb-pages')
  const sbSaved = $('sb-saved')

  if (sbFile) sbFile.textContent = State.currentFile
    ? getBaseName(State.currentFile) + '.sopx'
    : '未保存'

  const pages = $$('.a4-page, .a4-page-landscape').length
  if (sbPages) sbPages.textContent = `共 ${pages} 页`

  if (sbSaved && lastSaved) {
    const hh = lastSaved.getHours().toString().padStart(2,'0')
    const mm = lastSaved.getMinutes().toString().padStart(2,'0')
    sbSaved.textContent = `自动保存 ${hh}:${mm}`
  }
}

// ── 侧边栏切换 ────────────────────────────────────────────────────────────
function switchSidebarTab(tab) {
  State.sidebarTab = tab
  $$('.sidebar-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab))
  $$('.sidebar-panel').forEach(p => p.classList.toggle('active', p.id === tab + '-panel'))
}

function toggleSidebar() {
  State.sidebarCollapsed = !State.sidebarCollapsed
  document.getElementById('app').classList.toggle('sidebar-collapsed', State.sidebarCollapsed)
  const btn = $('sidebar-toggle')
  if (btn) btn.textContent = State.sidebarCollapsed ? '›' : '‹'
}

// ── Ribbon 标签切换 ────────────────────────────────────────────────────────
function switchRibbonTab(tab) {
  $$('.rib-tab').forEach(t => t.classList.toggle('active', t.dataset.rib === tab))
  $$('.rib-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === tab))
}

// ── 全局插入块（供 Ribbon 插入 tab 调用） ─────────────────────────────────
window.addGlobalBlock = function(type) {
  const pages = $$('.a4-page, .a4-page-landscape')
  const lastPage = pages[pages.length - 1]
  if (!lastPage) { toast('未找到文档页面', 'warn'); return }

  if (type === 'para') {
    const anyBlock = lastPage.querySelector('.para-block, .rich-block')
    if (anyBlock && window.addOuterText) { window.addOuterText(anyBlock, 'after'); return }
    toast('请在文档内某段落块上使用 ✚ 按钮插入', 'info', 4000)
  } else if (type === 'rich') {
    const anyBlock = lastPage.querySelector('.para-block, .rich-block')
    if (anyBlock && window.addOuterRich) { window.addOuterRich(anyBlock, 'after'); return }
    toast('请在文档内某段落块上使用 ✚ 按钮插入', 'info', 4000)
  } else if (type === 'sipoc') {
    if (window.addSipocSection) { window.addSipocSection(); return }
    toast('请通过页面内 ✚ 按钮添加 SIPOC 步骤', 'info', 4000)
  } else {
    toast('请在文档内对应位置使用悬浮工具栏操作', 'info', 4000)
  }
}

// ── 菜单动作响应 ──────────────────────────────────────────────────────────
function handleMenuAction(action) {
  const map = {
    new:        doNew,
    open:       doOpen,
    save:       doSave,
    saveAs:     doSaveAs,
    exportPDF:  doExportPDF,
    exportJSON: doExportJSON,
    exportHTML: doExportHTML,
  }
  if (map[action]) map[action]()
}

// ── 监听文档内容变化 → 标记脏状态 ───────────────────────────────────────
function setupDirtyTracking() {
  const wrapper = $('document-wrapper')
  if (!wrapper) return
  const obs = new MutationObserver(() => {
    if (!State.isDirty) markDirty(true)
  })
  obs.observe(wrapper, { childList: true, subtree: true, characterData: true, attributes: false })
}

// ── 键盘快捷键 ────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 's' && !e.shiftKey) { e.preventDefault(); doSave() }
    if (e.key === 's' &&  e.shiftKey) { e.preventDefault(); doSaveAs() }
    if (e.key === 'o')               { e.preventDefault(); doOpen() }
    if (e.key === 'n')               { e.preventDefault(); doNew() }
    if (e.key === 'p')               { e.preventDefault(); doExportPDF() }
  }
})

// ── 初始化 ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // 注册菜单动作
  if (window.sopAPI) {
    window.sopAPI.onMenuAction(handleMenuAction)
    window.sopAPI.onFileOpened(onFileOpened)
  }

  // 保存初始文档 HTML（用于新建重置）
  const wrapper = $('document-wrapper')
  if (wrapper) window._INITIAL_DOC_HTML = wrapper.innerHTML

  // Ribbon 标签切换
  $$('.rib-tab').forEach(tab => {
    tab.addEventListener('click', () => switchRibbonTab(tab.dataset.rib))
  })

  // 侧边栏标签切换
  $$('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => switchSidebarTab(tab.dataset.tab))
  })

  // 侧边栏折叠
  const toggleBtn = $('sidebar-toggle')
  if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar)

  // 工具栏按钮
  const binds = {
    'btn-new':       doNew,
    'btn-open':      doOpen,
    'btn-save':      doSave,      // QAT 保存按钮
    'btn-save-main': doSave,      // 文件 tab 保存按钮
    'btn-save-as':   doSaveAs,
    'btn-pdf':       doExportPDF,
    'btn-json':      doExportJSON,
    'btn-html':      doExportHTML,
  }
  Object.entries(binds).forEach(([id, fn]) => {
    const el = $(id)
    if (el) el.addEventListener('click', fn)
  })

  // 生成大纲（延迟等待原始 editor JS 初始化）
  setTimeout(() => {
    updateOutline()
    updateStatusBar()
    setupDirtyTracking()
    loadRecentList()
  }, 500)

  // 监听滚动 → 高亮当前大纲项
  const main = $('main')
  if (main) {
    let scrollTimer
    main.addEventListener('scroll', () => {
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(highlightCurrentOutlineItem, 120)
    })
  }

  setTitle('未命名文档', false)
})

function highlightCurrentOutlineItem() {
  const outlineItems = $$('#outline-panel .outline-item')
  if (!outlineItems.length) return
  const main = $('main')
  const scrollTop = main ? main.scrollTop : 0
  let active = null
  $$('h2.section-title').forEach((h2, i) => {
    if (h2.offsetTop - 100 <= scrollTop) active = outlineItems[i + 1]
  })
  outlineItems.forEach(i => i.classList.remove('active'))
  if (active) active.classList.add('active')
}

// 暴露给原始 editor JS 调用
window.appShowToast = toast
window.appMarkDirty = markDirty
window.appUpdateOutline = updateOutline

// ══════════════════════════════════════════════════════════
// 活跃元素状态追踪（供浮动工具栏操作函数使用）
// ══════════════════════════════════════════════════════════
;(function setupContextDetection() {
  // 当前活跃元素引用
  window._activeTable  = null   // editable-table-wrapper 或 matrix-wrapper
  window._activeTableUid = null
  window._activeSipoc  = null   // sipoc-step
  window._activeImage  = null   // transform-wrapper
  window._activeBlock  = null   // para-block / rich-block

  function showCtxTab(type) {
    // 上下文标签已移除，此函数仅保留兼容性
    if (!type) {
      // 无上下文，不切换标签
    }
  }

  document.addEventListener('click', function(e) {
    const wrapper = document.getElementById('document-wrapper')
    if (!wrapper || !wrapper.contains(e.target)) return

    // 检测：图片
    const tw = e.target.closest('.transform-wrapper')
    if (tw) {
      window._activeImage = tw
      const img = tw.querySelector('img')
      if (img) {
        const s = tw.style
        document.getElementById('img-w')  && (document.getElementById('img-w').value   = Math.round(parseFloat(s.width)  || img.offsetWidth))
        document.getElementById('img-h')  && (document.getElementById('img-h').value   = Math.round(parseFloat(s.height) || img.offsetHeight))
        const m = (s.transform || '').match(/rotate\(([^)]+)deg\)/)
        document.getElementById('img-rot') && (document.getElementById('img-rot').value = m ? m[1] : 0)
      }
      showCtxTab('image'); return
    }

    // 检测：可编辑表格
    const etw = e.target.closest('.editable-table-wrapper')
    if (etw) {
      window._activeTable = etw
      window._activeTableUid = etw.getAttribute('data-uid')
      // 读取当前行/列尺寸
      const td = e.target.closest('td, th')
      const tr = e.target.closest('tr')
      if (tr) document.getElementById('tbl-row-h') && (document.getElementById('tbl-row-h').value = tr.offsetHeight)
      if (td) document.getElementById('tbl-col-w') && (document.getElementById('tbl-col-w').value = td.offsetWidth)
      showCtxTab('table'); return
    }

    // 检测：矩阵表格
    const mw = e.target.closest('.matrix-wrapper')
    if (mw) {
      window._activeTable = mw
      window._activeTableUid = null
      const td = e.target.closest('td, th')
      const tr = e.target.closest('tr')
      if (tr) document.getElementById('tbl-row-h') && (document.getElementById('tbl-row-h').value = tr.offsetHeight)
      if (td) document.getElementById('tbl-col-w') && (document.getElementById('tbl-col-w').value = td.offsetWidth)
      showCtxTab('table'); return
    }

    // 检测：SIPOC 步骤
    const ss = e.target.closest('.sipoc-step')
    if (ss) {
      window._activeSipoc = ss
      showCtxTab('sipoc'); return
    }

    // 检测：段落块
    const pb = e.target.closest('.para-block, .rich-block')
    if (pb) { window._activeBlock = pb }

    // 普通内容区 → 无上下文
    showCtxTab(null)
  }, true)
})()

// ══════════════════════════════════════════════════════════
// 表格操作（Ribbon 表格工具调用）
// ══════════════════════════════════════════════════════════
window.appTableOp = function(op, val) {
  const uid = window._activeTableUid
  const tbl = window._activeTable
  if (!tbl) { toast('请先点击要操作的表格', 'warn'); return }

  if (uid) {
    // editable-table-wrapper 使用原始编辑器函数
    const fnMap = {
      addRowAbove: () => window.rtAddRowBefore && window.rtAddRowBefore(uid),
      addRowBelow: () => window.rtAddRow      && window.rtAddRow(uid),
      delRow:      () => window.rtDelRow      && window.rtDelRow(uid),
      addColLeft:  () => window.rtAddColBefore && window.rtAddColBefore(uid),
      addColRight: () => window.rtAddCol      && window.rtAddCol(uid),
      delCol:      () => window.rtDelCol      && window.rtDelCol(uid),
      merge:       () => window.rtMergeSelectedCells && window.rtMergeSelectedCells(uid),
      split:       () => window.rtUnmergeCell && window.rtUnmergeCell(uid),
    }
    if (fnMap[op]) { fnMap[op](); return }
  }

  // 行高/列宽（适用于所有表格）
  if (op === 'setRowHeight') {
    const px = parseInt(val)
    if (!px || px < 10) return
    // 找当前选中行
    const sel = window.getSelection()
    const tr  = sel && sel.anchorNode ? sel.anchorNode.parentElement?.closest('tr') : null
    const target = tr || tbl.querySelector('tbody tr') || tbl.querySelector('tr')
    if (target) { target.style.height = px + 'px'; target.style.minHeight = px + 'px' }
    toast('行高已设置', 'success')
    return
  }
  if (op === 'setColWidth') {
    const px = parseInt(val)
    if (!px || px < 10) return
    const sel = window.getSelection()
    const td  = sel && sel.anchorNode ? sel.anchorNode.parentElement?.closest('td,th') : null
    if (td) {
      const colIdx = Array.from(td.parentElement.children).indexOf(td)
      tbl.querySelectorAll('tr').forEach(row => {
        const cell = row.children[colIdx]
        if (cell) { cell.style.width = px + 'px'; cell.style.minWidth = px + 'px' }
      })
      toast('列宽已设置', 'success')
    }
    return
  }

  // matrix-wrapper 行列操作（fallback）
  const btn = tbl.querySelector('.block-toolbar button')
  toast('请使用表格内工具栏操作矩阵表格行列', 'info')
}

// ══════════════════════════════════════════════════════════
// SIPOC 操作
// ══════════════════════════════════════════════════════════
window.appSipocOp = function(op) {
  const step = window._activeSipoc
  if (!step) { toast('请先点击要操作的 SIPOC 步骤', 'warn'); return }
  const bar = step.querySelector('.sipoc-action-bar')
  if (op === 'insertBefore') {
    const btn = bar && bar.querySelector('button[onclick*="before"], button[title*="上"]')
    if (btn) btn.click()
    else if (window.insertSipocStepBefore) window.insertSipocStepBefore(step)
    else toast('未找到插入函数', 'warn')
  } else if (op === 'insertAfter') {
    const btn = bar && bar.querySelector('button[onclick*="after"], button[title*="下"]')
    if (btn) btn.click()
    else if (window.insertSipocStepAfter) window.insertSipocStepAfter(step)
    else toast('未找到插入函数', 'warn')
  } else if (op === 'delete') {
    const btn = bar && bar.querySelector('button[onclick*="remove"], button[title*="删"]')
    if (btn) btn.click()
    else if (window.undoableRemove) window.undoableRemove(step, '.sipoc-step')
  }
}

// ══════════════════════════════════════════════════════════
// 图片操作
// ══════════════════════════════════════════════════════════
window.appImageOp = function(prop, val) {
  const tw = window._activeImage
  if (!tw) { toast('请先点击要操作的图片', 'warn'); return }
  if (prop === 'width')  { tw.style.width  = parseInt(val) + 'px' }
  if (prop === 'height') { tw.style.height = parseInt(val) + 'px' }
  if (prop === 'rotate') {
    const cur = tw.style.transform || ''
    const base = cur.replace(/rotate\([^)]+\)/g, '').trim()
    tw.style.transform = (base + ' rotate(' + parseInt(val) + 'deg)').trim()
  }
  if (prop === 'delete') {
    if (window.deleteFlowchart) window.deleteFlowchart({ target: tw })
    else tw.remove()
    window._activeImage = null
    showCtxTab(null)
  }
}

// ══════════════════════════════════════════════════════════
// 插入块（Ribbon 插入 tab）
// ══════════════════════════════════════════════════════════
window.appInsertBlock = function(type) {
  const pages = document.querySelectorAll('.a4-page, .a4-page-landscape')
  const last  = pages[pages.length - 1]
  if (!last) { toast('未找到文档页面', 'warn'); return }
  const ref = window._activeBlock || last.querySelector('.para-block, .rich-block')

  if (type === 'para' && ref && window.addOuterText) { window.addOuterText(ref, 'after'); return }
  if (type === 'rich' && ref && window.addOuterRich) { window.addOuterRich(ref, 'after'); return }
  if (type === 'sipoc' && window.addSipocSection)    { window.addSipocSection(); return }
  if (type === 'editable-table' && ref && window.insertRichTable) {
    // 在富文本块里插入表格
    const rich = ref.classList.contains('rich-block') ? ref : last.querySelector('.rich-block')
    if (rich && window.insertRichTable) { window.insertRichTable(rich); return }
  }
  toast('请在文档内点击一个段落块，再使用插入功能', 'info', 4000)
}

// ══════════════════════════════════════════════════════════
// 页眉页脚
// ══════════════════════════════════════════════════════════
window.appSetPageHeader = function(text) {
  document.querySelectorAll('.page-header').forEach(h => { h.textContent = text })
}
window.appSetPageFooter = function(text) {
  document.querySelectorAll('.page-footer').forEach(f => { f.textContent = text })
}

// ── 删除当前活跃块 ───────────────────────────────────────────────────────────
window.appDeleteBlock = function() {
  const block = window._activeBlock
  if (!block) { toast('请先点击要删除的段落块或富文本块', 'warn'); return }
  const selector = block.classList.contains('rich-block') ? '.rich-block' : '.para-block'
  if (window.undoableRemove) {
    window.undoableRemove(block, selector)
    window._activeBlock = null
    toast('块已删除（可撤销）', 'success')
  } else {
    block.remove()
    window._activeBlock = null
  }
}

// ── 在富文本块内插入表格或图片 ───────────────────────────────────────────────
window.appInsertIntoRich = function(type) {
  // 找当前活跃的富文本块
  let rich = window._activeBlock && window._activeBlock.classList.contains('rich-block')
    ? window._activeBlock
    : document.querySelector('.rich-block:focus-within')

  if (!rich) {
    // 没有活跃块时，给提示
    toast('请先点击一个富文本块，再使用此功能', 'info', 4000)
    return
  }

  // 找富文本块内容区（contenteditable 区域）
  const editable = rich.querySelector('[contenteditable="true"]') || rich

  if (type === 'table') {
    if (window.insertRichTable) {
      // 原始函数需要一个按钮元素作参数，传入富文本块本身
      window.insertRichTable(rich)
    } else {
      // 回退：直接插入一个简单的2x2表格 HTML
      const tbl = `<table border="1" style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px;border:1px solid #ccc;min-width:60px">&nbsp;</td><td style="padding:4px;border:1px solid #ccc;min-width:60px">&nbsp;</td></tr>
        <tr><td style="padding:4px;border:1px solid #ccc">&nbsp;</td><td style="padding:4px;border:1px solid #ccc">&nbsp;</td></tr>
      </table><br>`
      editable.focus()
      document.execCommand('insertHTML', false, tbl)
    }
    toast('表格已插入', 'success')
  } else if (type === 'image') {
    if (window.insertRichImage) {
      window.insertRichImage(rich)
    } else {
      // 回退：触发文件选择
      const input = document.getElementById('flowchart-input')
      if (input) input.click()
    }
    toast('请选择图片文件', 'info')
  }
}

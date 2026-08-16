import { app, BrowserWindow, dialog, Notification, shell } from 'electron'
import { spawn, ChildProcess } from 'node:child_process'
import path from 'node:path'
import { log } from './log.js'
import { autoUpdater } from 'electron-updater'

const READY_RE = /^dsh web: (https?:\/\/\S+)/   // D4 就绪行
const START_TIMEOUT_MS = 180_000                 // dsh 首次启动（初始化 profile + 安全软件扫描）可能需 1-2 分钟
const STOP_TIMEOUT_MS = 5_000                   // dsh 优雅排空窗口
const MAX_RESTARTS = 3                          // 5 分钟内最多自动重启次数

let child: ChildProcess | null = null
let window: BrowserWindow | null = null
let splash: BrowserWindow | null = null
let dshStartAt = 0
let eventsAbort: AbortController | null = null
let readyUrl: string | null = null
let isQuitting = false
let restarts = 0
let lastRestartAt = 0

// 禁用 GPU 硬件加速：规避部分 Windows 显卡驱动的 Electron 崩溃（须在 ready 前调用）
app.disableHardwareAcceleration()
app.setAppUserModelId('com.deepharness.app')   // Windows 系统通知需要 AppUserModelID

// ── 单实例锁 ─────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (window) { if (window.isMinimized()) window.restore(); window.focus() }
  })
  app.whenReady().then(main)
}

// ── 解析 dsh bin 路径（npm 包内）──────────────────────────
function resolveDshBin(): string {
  const pkgPath = require.resolve('@deepseek-ai/dsh/package.json')
  return path.join(path.dirname(pkgPath), 'lib', 'bin.js')
}

// ── 客户端 patch 层路径（D6）─────────────────────────────
function resolvePatchPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'client.patch.yml')
    : path.join(app.getAppPath(), 'resources', 'client.patch.yml')
}

// ── sidecar node 路径（D9）───────────────────────────────
function resolveNodePath(): string {
  if (process.env.DSH_NODE_PATH) return process.env.DSH_NODE_PATH
  if (app.isPackaged) return path.join(process.resourcesPath, 'node', 'node.exe')
  return 'node'   // 开发模式用系统 node
}

// ── 启动画面（splash）：双击立即有反馈，后台等 dsh 就绪 ──
function showSplash(): void {
  splash = new BrowserWindow({
    width: 420, height: 260,
    frame: false, resizable: false, show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  splash.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
    '<html><body style="margin:0;background:#1a1a1a;color:#eee;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;height:100vh;user-select:none;"><div style="font-size:26px;font-weight:600;">DeepHarness</div><div style="font-size:13px;color:#8a8a8a;margin-top:4px;">v' + app.getVersion() + '</div><div style="font-size:14px;color:#9a9a9a;margin-top:12px;">正在启动，请稍候…</div></body></html>'))
  splash.once('ready-to-show', () => splash?.show())
}

function closeSplash(): void {
  if (splash) { splash.close(); splash = null }
}

// ── 启动 dsh 子进程 ──────────────────────────────────────
function startDsh(): void {
  dshStartAt = Date.now()
  const node = resolveNodePath()
  const args = [
    resolveDshBin(),
    'web',
    '--patch', resolvePatchPath(),   // launcher 参数必须排在 app 参数之前
    '--port', '0',                   // --port 是 app 参数；它之后的内容都归 web app
  ]
  log(`spawn: ${node} ${args.join(' ')}`)
  const proc = spawn(node, args, { env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] })
  child = proc

  proc.stdout.on('data', (buf) => {
    const text = buf.toString()
    log('[dsh stdout] ' + text.trimEnd())
    const m = text.match(READY_RE)
    if (m) openWindow(m[1])                    // 拿到就绪 URL → 开窗口
  })
  proc.stderr.on('data', (buf) => log('[dsh stderr] ' + buf.toString().trimEnd()))

  proc.on('error', (err) => {
    log('spawn error: ' + err.message)
    dialog.showErrorBox('启动失败',
      '无法启动 dsh 服务。请确认已安装 Node.js ≥ 22.19。\n' + err.message)
    app.quit()
  })
  proc.on('exit', (code, signal) => {
    log(`dsh exited code=${code} signal=${signal}`)
    child = null
    if (window && !window.isDestroyed()) {
      maybeRestart()
    }
  })

  // 超时保护：60s 没出就绪行就报错
  setTimeout(() => {
    if (!window && child) {
      log('startup timeout')
      dialog.showErrorBox('启动超时', 'dsh 服务 60 秒内未就绪，请查看日志。')
      app.quit()
    }
  }, START_TIMEOUT_MS)
}

// ── 打开窗口 ─────────────────────────────────────────────
function openWindow(url: string): void {
  if (window) return
  log(`ready: ${url} (dsh 启动耗时 ${Date.now() - dshStartAt}ms)`)
  closeSplash()
  window = new BrowserWindow({
    width: 1280, height: 800,
    title: `DeepHarness v${app.getVersion()}`,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },  // D5
  })
  window.once('ready-to-show', () => window?.show())
  window.loadURL(url)
  void watchDshEvents(url)   // 连接 dsh 事件流（审批/任务结束 → 系统通知）
  // 外链一律走系统浏览器，不在应用内开新窗口
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  window.on('closed', () => { window = null })
}

// ── dsh 事件流（WebSocket）：审批请求 + 任务结束 → 系统通知 ──
function watchDshEvents(url: string): void {
  eventsAbort?.abort()
  eventsAbort = new AbortController()
  readyUrl = url
  const wsUrl = url.replace(/^http/, 'ws').replace(/\/+$/, '') + '/api/events.mux'
  let ws: WebSocket
  try {
    ws = new WebSocket(wsUrl)
  } catch (e) {
    log('events: WebSocket 创建失败 ' + String(e))
    return
  }
  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      handleEventFrame(ev.data)
    }
  }
  ws.onclose = () => {
    if (!isQuitting) {
      setTimeout(() => { if (readyUrl && !isQuitting) void watchDshEvents(readyUrl) }, 3000)
    }
  }
}

function handleEventFrame(json: string): void {
  let frame: { method?: string; payload?: { toolName?: string; reason?: string; event?: { type?: string; data?: { reason?: { kind?: string } } } } }
  try { frame = JSON.parse(json) } catch { return }
  const payload = frame.payload
  if (frame.method === 'approval/requested' && payload) {
    const tool = payload.toolName ?? '未知工具'
    notify('DeepHarness 需要您的许可', `工具「${tool}」请求执行许可${payload.reason ? '：' + payload.reason : ''}`)
  } else if (frame.method === 'session/event' && payload?.event?.type === 'turn/end') {
    const kind = payload.event.data?.reason?.kind
    const text = kind === 'completed' ? '任务已完成' : kind === 'error' ? '任务出错' : kind === 'interrupted' ? '任务已中断' : '任务已结束'
    notify('DeepHarness', text)
  }
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return
  const n = new Notification({ title, body })
  n.on('click', () => {
    if (window) { if (window.isMinimized()) window.restore(); window.focus() }
  })
  n.show()
}

// ── 停止子进程：SIGTERM → 等 5s → SIGKILL ────────────────
function stopChild(): Promise<void> {
  const proc = child
  if (!proc || proc.killed) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      log('graceful stop timed out, SIGKILL')
      proc.kill('SIGKILL')
      resolve()
    }, STOP_TIMEOUT_MS)
    proc.once('exit', () => { clearTimeout(timer); resolve() })
    proc.kill('SIGTERM')
  })
}

// ── 崩溃自动重启（限次）──────────────────────────────────
function maybeRestart(): void {
  const now = Date.now()
  if (now - lastRestartAt > 5 * 60_000) restarts = 0   // 滑动窗口
  lastRestartAt = now
  if (restarts >= MAX_RESTARTS) {
    dialog.showErrorBox('dsh 服务持续崩溃', '已自动重启多次，请查看日志。')
    app.quit()
    return
  }
  restarts++
  log(`auto restart #${restarts}`)
  startDsh()
}

// ── 自动更新（D8）────────────────────────────────────────
autoUpdater.allowDowngrade = true
autoUpdater.autoDownload = false
autoUpdater.on('update-available', (info) => {
  if (!window) return
  dialog.showMessageBox(window, {
    type: 'info', buttons: ['立即更新', '稍后'],
    message: `发现新版本 ${info.version}`,
  }).then(({ response }) => { if (response === 0) autoUpdater.downloadUpdate() })
})
autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall()
})

// ── 生命周期 ─────────────────────────────────────────────
async function main(): Promise<void> {
  app.on('window-all-closed', () => app.quit())
  app.on('before-quit', (e) => {
    // 阻止默认退出，先优雅停子进程
    e.preventDefault()
    isQuitting = true
    eventsAbort?.abort()
    void (async () => {
      await stopChild()
      app.exit(0)
    })()
  })
  showSplash()
  startDsh()
  // 启动后延迟 10s 检查更新（开发/无 feed 时静默忽略失败）
  setTimeout(() => { void autoUpdater.checkForUpdates().catch(() => {}) }, 10_000)
}

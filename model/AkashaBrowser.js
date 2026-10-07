/**
 * AkashaBrowser — akasha.cv 的取数实现（浏览器会话）
 *
 * 为什么必须这样取数：akasha 的 `/api/` 在 Cloudflare 后面，**纯 HTTP 客户端一律 403**
 * （实测 Node fetch 带浏览器 UA + Referer 是挑战页；即使把浏览器里的 cf_clearance/connect.sid
 * 拿回来用纯 HTTP 调，仍然 403）。可行的办法是**用真浏览器打开它的页面，让页面自己发请求，
 * 我们拦截响应**——实测打开 `/profile/<uid>` 时它会请求
 *   /api/user/<uid>、/api/getCalculationsForUser/<uid>、/api/textmap/... 等，全部 200。
 *
 * 复用方式：优先用框架渲染后端那个已经在跑的 puppeteer 浏览器（不额外吃内存）；
 * 拿不到再按渲染后端的 chromiumPath 自己起一个，空闲 10 分钟自动关闭。
 *
 * 与 AkashaClient 的关系：本文件只实现 `transport(url, opts)` 这一层，
 * 由 apps 层 `setTransport(akashaBrowserTransport)` 接进去，解析/缓存仍在 AkashaClient。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getAkashaTimeoutMs } from '../components/config.js'

/** 本模块会拦截的接口前缀（够用即可，多了只是白等） */
const NEEDED = ['/api/user/', '/api/getCalculationsForUser/', '/api/textmap/', '/api/builds/', '/api/artifacts']

/** 空闲多久关掉自己起的浏览器（毫秒） */
const IDLE_CLOSE_MS = 10 * 60 * 1000

let ownBrowser = null
let ownBrowserIdleTimer = null
let puppeteerModule = null
let launchConfig = null

/** 动态加载 puppeteer
 *  插件装在 <bot>/plugins/ 下时能直接 import 到 bot 的 node_modules；
 *  工作区（不在 bot 里）跑预览/测试时用 createRequire 以 bot 根为基准解析。 */
async function loadPuppeteer () {
  if (puppeteerModule) return puppeteerModule
  try {
    puppeteerModule = (await import('puppeteer')).default
    return puppeteerModule
  } catch { /* 回落到 createRequire */ }
  const { createRequire } = await import('node:module')
  const req = createRequire(path.join(process.cwd(), 'package.json'))
  puppeteerModule = req('puppeteer')
  return puppeteerModule
}

/**
 * 框架渲染后端（puppeteer）的实例
 * 它暴露 `browser` 与启动配置，用它就能复用同一个浏览器，也不必自己猜 chromium 路径。
 */
async function rendererBackend () {
  try {
    const loader = (await import('../../../lib/renderer/loader.js')).default
    const backend = loader?.getRenderer?.('puppeteer')
    return backend?.browser ? backend : null
  } catch {
    return null
  }
}

/** 从渲染后端配置里取 chromium 路径（自己起浏览器时用） */
function chromiumPathFrom (backend) {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH
  if (fromEnv) return fromEnv
  const cfg = backend?.config || {}
  return cfg.executablePath || cfg.chromiumPath || ''
}

/** 拿到一个可用的浏览器：先复用渲染后端的，再考虑自己起 */
async function getBrowser () {
  const backend = await rendererBackend()
  if (backend?.browser) return { browser: backend.browser, owned: false }

  if (ownBrowser?.connected) return { browser: ownBrowser, owned: true }

  const puppeteer = await loadPuppeteer()
  const exe = chromiumPathFrom(backend)
  launchConfig = {
    headless: 'new',
    args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox', '--no-zygote'],
    ...(exe ? { executablePath: exe } : {})
  }
  ownBrowser = await puppeteer.launch(launchConfig)
  return { browser: ownBrowser, owned: true }
}

/** 自己起的浏览器：空闲一段时间后关闭 */
function touchIdleTimer () {
  if (!ownBrowser) return
  clearTimeout(ownBrowserIdleTimer)
  ownBrowserIdleTimer = setTimeout(async () => {
    try {
      await ownBrowser?.close()
    } catch { /* 忽略 */ }
    ownBrowser = null
  }, IDLE_CLOSE_MS)
  ownBrowserIdleTimer.unref?.()
}

/**
 * 用浏览器会话取一个 akasha URL
 *
 * 两条路，按接口选：
 *  1) 页面自己就会请求的接口（`/api/user/<uid>`、`/api/getCalculationsForUser/<uid>`）→ **拦截页面响应**
 *     （最稳：等同站点自己的通道，实测 200）；
 *  2) 其它接口（如 textmap 中文化）→ 页面加载完会话建立后，**在页面内 fetch 我们的 URL**；
 *     这条路可能被 Cloudflare 认出，失败就由上层降级（武器/套装名保留英文）。
 * @param {string} url - akasha API 绝对地址
 * @param {object} [opts] - { timeoutMs }
 * @returns {Promise<{status: number, text: string}>}
 */
export async function akashaBrowserTransport (url, opts = {}) {
  const timeoutMs = opts.timeoutMs || getAkashaTimeoutMs()
  const parsed = new URL(url)
  const apiPath = parsed.pathname + parsed.search
  const pathname = parsed.pathname
  const interceptable = NEEDED.slice(0, 2).some(prefix => pathname.startsWith(prefix))
  const uidMatch = pathname.match(/\/(?:user|getCalculationsForUser)\/(\d{9,10})/)
  const uid = uidMatch?.[1] || ''
  const pageUrl = uid ? `https://akasha.cv/profile/${uid}` : 'https://akasha.cv/'

  const { browser } = await getBrowser()
  touchIdleTimer()
  const page = await browser.newPage()
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9' })

    // 页面自身的 textmap 响应（含它当下要显示的词）——顺手收下来给中文化兜底
    const harvested = {}
    page.on('response', async (res) => {
      if (!res.url().includes('/api/textmap/')) return
      try {
        const json = JSON.parse(await res.text())
        Object.assign(harvested, json?.translation || {})
      } catch { /* 忽略 */ }
    })

    // 路径 1：拦截页面自身发出的同路径响应
    let intercepted = null
    if (interceptable) {
      const hit = new Promise((resolve) => {
        page.on('response', async (res) => {
          const resUrl = res.url()
          if (!resUrl.includes('/api/')) return
          if (!new URL(resUrl).pathname.startsWith(pathname)) return
          try {
            resolve({ status: res.status(), text: await res.text() })
          } catch { /* 读流失败继续等 */ }
        })
      })
      intercepted = hit
    }

    await page.goto(pageUrl, { waitUntil: interceptable ? 'domcontentloaded' : 'networkidle2', timeout: timeoutMs }).catch(() => {})

    if (interceptable) {
      const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`akasha 页面在 ${Math.round(timeoutMs / 1000)}s 内没有请求该接口（可能改版或限流）`)), timeoutMs).unref?.()
      })
      return await Promise.race([intercepted, timeout])
    }

    // 路径 2：会话建好后在页面内 fetch；失败就把「页面自己那份 textmap」还回去（至少能中文化一部分）
    const direct = await page.evaluate(async (target) => {
      try {
        const res = await fetch(target, { headers: { Accept: 'application/json' } })
        return { status: res.status, text: await res.text() }
      } catch (err) {
        return { status: 0, text: JSON.stringify({ error: String(err?.message || err) }) }
      }
    }, url)
    if (direct.status === 200) return direct
    if (pathname.includes('/api/textmap/') && Object.keys(harvested).length) {
      return { status: 200, text: JSON.stringify({ translation: harvested }) }
    }
    return direct
  } finally {
    try { await page.close() } catch { /* 忽略 */ }
  }
}

/** 关闭自己起的浏览器（插件卸载/测试用） */
export async function closeAkashaBrowser () {
  clearTimeout(ownBrowserIdleTimer)
  try {
    await ownBrowser?.close()
  } catch { /* 忽略 */ }
  ownBrowser = null
}

/** 当前取数状态（状态页/排查用） */
export async function akashaBrowserInfo () {
  const backend = await rendererBackend()
  return {
    reuseRendererBrowser: Boolean(backend?.browser),
    ownBrowser: Boolean(ownBrowser?.connected),
    rendererDir: backend?.config?.executablePath || backend?.config?.chromiumPath || ''
  }
}

/** 小工具：把本地图片路径转成模板可用的 file:// 地址（akasha 的图标是外链，不需要它） */
export const fileUrl = (p) => (p ? pathToFileURL(p).href : '')

/** 判断某个文件是否存在（供上层做可选资源探测） */
export const exists = (p) => {
  try {
    return Boolean(p) && fs.statSync(p).isFile()
  } catch {
    return false
  }
}

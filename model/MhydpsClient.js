/**
 * MhydpsClient — mhydps.cn 的 HTTP 客户端
 *
 * 站点是 Cloudflare 后面的个人站点，接口无公开文档，实测约束：
 *   1. 必须带 `Referer: https://www.mhydps.cn/`，否则 nginx 返回 403
 *   2. 国内网络直连 `www.mhydps.cn` 会被重置（TLS 握手阶段 RST），需在配置里填代理
 * 因此这里只做三件事：拼请求头、可选走代理、给每次请求加超时。
 * 用 node:https 而不是全局 fetch，是因为全局 fetch（undici）不接受 https-proxy-agent 的 agent。
 */
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'
import { SITE_ORIGIN, SITE_REFERER, SITE_USER_AGENT } from '../components/constants.js'
import { getProxy, getTimeoutMs } from '../components/config.js'

/** 懒加载的 HttpsProxyAgent 构造器：null=未加载，false=加载失败 */
let HttpsProxyAgent = null

/** 按代理地址缓存 agent（同地址复用连接池） */
const agentCache = new Map()

/** 最大重定向次数 */
const MAX_REDIRECT = 3

/**
 * 取代理 agent；proxy 为空返回 undefined（直连）
 * @param {string} proxy - 形如 http://<代理主机>:<端口>
 * @returns {Promise<object|undefined>}
 */
async function resolveAgent (proxy) {
  if (!proxy) return undefined
  if (agentCache.has(proxy)) return agentCache.get(proxy)

  if (HttpsProxyAgent === null) {
    try {
      const mod = await import('https-proxy-agent')
      HttpsProxyAgent = mod?.HttpsProxyAgent || mod?.default || false
    } catch (err) {
      logger?.warn?.(`[Mhydps] https-proxy-agent 加载失败: ${err.message}`)
      HttpsProxyAgent = false
    }
  }
  if (!HttpsProxyAgent) {
    throw new Error('配置了 proxy 但 https-proxy-agent 不可用，请先执行 pnpm install --filter=Mhydps-Plugin')
  }

  const agent = new HttpsProxyAgent(proxy)
  agentCache.set(proxy, agent)
  return agent
}

/** 拼站点绝对地址（传相对路径时补上 SITE_ORIGIN） */
export function siteUrl (pathOrUrl) {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${SITE_ORIGIN}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`
}

/**
 * 发一次 GET 请求，收集完整响应体
 * @param {string} url - 绝对地址
 * @param {object} [opts]
 * @param {string} [opts.proxy] - 代理地址，默认读配置
 * @param {number} [opts.timeoutMs] - 超时，默认读配置
 * @param {object} [opts.headers] - 附加请求头
 * @returns {Promise<{ statusCode: number, headers: object, buffer: Buffer, url: string }>}
 */
export async function httpGet (url, opts = {}) {
  const proxy = opts.proxy !== undefined ? opts.proxy : getProxy()
  const timeoutMs = opts.timeoutMs || getTimeoutMs()
  const agent = await resolveAgent(proxy)

  return await new Promise((resolve, reject) => {
    const target = new URL(url)
    const mod = target.protocol === 'http:' ? http : https
    const req = mod.request(target, {
      method: 'GET',
      agent,
      headers: {
        // Referer 是站点 nginx 的硬要求；UA 沿用站点前端自身使用的标识
        Referer: SITE_REFERER,
        'User-Agent': SITE_USER_AGENT,
        Accept: '*/*',
        ...opts.headers
      }
    }, (res) => {
      const status = res.statusCode || 0

      // 重定向：跟随 Location（相对地址按当前 URL 解析）
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume()
        const hops = (opts._hops || 0) + 1
        if (hops > MAX_REDIRECT) {
          reject(new Error(`重定向次数超过 ${MAX_REDIRECT}`))
          return
        }
        const next = new URL(res.headers.location, url).href
        httpGet(next, { ...opts, _hops: hops }).then(resolve, reject)
        return
      }

      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({
        statusCode: status,
        headers: res.headers,
        buffer: Buffer.concat(chunks),
        url
      }))
      res.on('error', reject)
    })

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`请求超时（${timeoutMs}ms）`))
    })
    req.on('error', (err) => {
      const hint = proxy ? `（代理 ${proxy}）` : '（直连；国内网络访问 mhydps.cn 需在配置里填代理）'
      reject(new Error(`${err.message}${hint}`))
    })
    req.end()
  })
}

/**
 * GET 并解析 JSON
 * @param {string} pathOrUrl - 站点相对路径或绝对地址
 * @param {object} [opts] - 同 httpGet
 * @returns {Promise<any>}
 */
export async function fetchJson (pathOrUrl, opts = {}) {
  const url = siteUrl(pathOrUrl)
  const res = await httpGet(url, opts)
  if (res.statusCode === 403) {
    throw new Error(`站点拒绝访问（403）：${url}，可能是 Referer 校验或站点策略变化`)
  }
  if (res.statusCode !== 200) {
    throw new Error(`HTTP ${res.statusCode}：${url}`)
  }
  try {
    return JSON.parse(res.buffer.toString('utf8'))
  } catch (err) {
    throw new Error(`响应不是合法 JSON（${url}）：${err.message}`)
  }
}

/**
 * 下载文件到本地（先写临时文件再改名，避免中断留下半个文件）
 * @param {string} url - 绝对地址
 * @param {string} destPath - 目标路径
 * @param {object} [opts] - 同 httpGet
 * @returns {Promise<number>} 写入字节数
 */
export async function downloadTo (url, destPath, opts = {}) {
  const res = await httpGet(url, opts)
  if (res.statusCode !== 200) {
    throw new Error(`HTTP ${res.statusCode}：${url}`)
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  const tmp = `${destPath}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, res.buffer)
  fs.renameSync(tmp, destPath)
  return res.buffer.length
}

/** 清空 agent 缓存（配置里的代理改过之后调用；测试用） */
export function resetAgentCache () {
  agentCache.clear()
  HttpsProxyAgent = null
}

export { SITE_USER_AGENT }

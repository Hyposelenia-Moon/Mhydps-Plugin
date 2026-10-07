/**
 * AkashaClient — akasha.cv 数据的接口层（数据源二：练度查询）
 *
 * akasha.cv 是「按 UID 记录角色练度」的站点：每个角色给出它在某条赛道（`COMBO`/`VAPE`/`LUNAR`…）
 * 下的伤害与**名次**（`ranking` / `outOf`），这与 mhydps.cn 的「匿名配队期望 DPS 榜」是**两套口径**，
 * 因此本文件只做「取数与解析」，不参与任何与 mhydps 数值的换算或比较。
 *
 * ── 为什么要留 transport 这一层 ────────────────────────────────────────────────
 * akasha.cv 的 /api/ 在 Cloudflare 后面：**纯 HTTP 客户端一律 403**（实测 Node fetch 带浏览器 UA
 * 与 Referer 仍拿到 `Just a moment...` 挑战页）。可行的取数方式是走浏览器会话（打开个人页、
 * 拦截页面自身发出的 /api/ 响应，实测全部 200）。取数机制还在与另一位开发者确认，所以这里：
 *   - 默认 transport = 直连 HTTP（会明确报 `AKASHA_BLOCKED`，不会静默给错数据）
 *   - 提供 `setTransport()` / `opts.transport` 注入点，后续接浏览器会话时只换 transport，不动解析
 *
 * 端点（实测字段见 test/fixtures/akasha.*.sample.json）：
 *   /api/user/<uid>                    → data.account（playerInfo：昵称/AR/深渊/剧诗/幽境危战）
 *   /api/getCalculationsForUser/<uid>  → data[]（每角色：命座/武器/套装 + calculations 名次与伤害）
 *   /api/textmap/<lang>?words[]=…       → 英文名批量中文化（角色名走本插件角色表，不必请求）
 */
import fs from 'node:fs'
import path from 'node:path'
import { getAkashaCacheTtlMinutes, getAkashaProxy, getAkashaTimeoutMs } from '../components/config.js'
import { AKASHA_BASE, AKASHA_CACHE_DIR, AKASHA_LANG } from '../components/constants.js'
import { dataDir } from './TeamStore.js'

/** 缓存目录（data/akasha/，gitignore） */
export const akashaCacheDir = path.join(dataDir, AKASHA_CACHE_DIR)

/**
 * 默认取数实现：直连 HTTP（akasha 会 403，见文件头说明）
 * @param {string} url
 * @param {object} opts - { headers, timeoutMs }
 * @returns {Promise<{status: number, text: string}>}
 */
async function defaultTransport (url, opts = {}) {
  const res = await fetch(url, {
    headers: opts.headers,
    signal: opts.timeoutMs ? AbortSignal.timeout(opts.timeoutMs) : undefined
  })
  return { status: res.status, text: await res.text() }
}

/** 当前取数实现（浏览器会话接进来时替换它） */
let transport = defaultTransport

/**
 * 替换取数实现（进程级；测试与后续的浏览器会话都走这里）
 * @param {Function|null} fn - 传 null 恢复默认直连
 */
export function setTransport (fn) {
  transport = typeof fn === 'function' ? fn : defaultTransport
}

/** 请求头（akasha 是浏览器应用，带上常见的浏览器标识） */
const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': `${AKASHA_LANG},zh;q=0.9,en;q=0.8`,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Referer: `${AKASHA_BASE}/`
}

/** 错误码（调用方按 code 决定文案与降级） */
export const AKASHA_ERROR = {
  blocked: 'AKASHA_BLOCKED',
  notFound: 'AKASHA_NOT_FOUND',
  http: 'AKASHA_HTTP',
  parse: 'AKASHA_PARSE'
}

/** 构造带 code 的错误 */
function akashaError (code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

/**
 * 判定响应：HTML 挑战页 / 非 JSON 都算「被挡」
 * @param {number} status
 * @param {string} text
 * @returns {object} 解析后的 JSON
 */
function parseResponse (status, text) {
  const head = String(text || '').trim().slice(0, 200)
  if (/^</.test(head) || /Just a moment|Attention Required|cf-browser-verification/i.test(head)) {
    throw akashaError(AKASHA_ERROR.blocked, 'akasha 返回了 Cloudflare 挑战页（纯 HTTP 取数被挡，需要浏览器会话）')
  }
  if (status === 404) throw akashaError(AKASHA_ERROR.notFound, 'akasha 没有这个 UID 的记录')
  if (status === 429) throw akashaError(AKASHA_ERROR.http, 'akasha 请求过于频繁（429），稍后再试')
  if (status < 200 || status >= 300) throw akashaError(AKASHA_ERROR.http, `akasha 请求失败（HTTP ${status}）`)
  try {
    return JSON.parse(text)
  } catch {
    throw akashaError(AKASHA_ERROR.parse, 'akasha 返回的不是 JSON')
  }
}

/** GET 一个 akasha API（自动带 transport / 代理 / 超时） */
export async function akashaGet (endpoint, params = {}, opts = {}) {
  const url = new URL(`${AKASHA_BASE}/api/${String(endpoint).replace(/^\//, '')}`)
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach(v => url.searchParams.append(key, v))
    else if (value !== undefined && value !== null) url.searchParams.set(key, value)
  }
  // 代理：akasha 自己不在墙内，默认直连；只有 akashaProxy 显式填了才走代理
  const proxy = opts.proxy ?? getAkashaProxy()
  const timeoutMs = opts.timeoutMs ?? getAkashaTimeoutMs()
  const use = opts.transport || transport
  const res = await use(url.toString(), { headers: { ...HEADERS, ...(opts.headers || {}) }, timeoutMs, proxy })
  return parseResponse(res.status, res.text)
}

/* ===================== 缓存（data/akasha/<uid>.json） ===================== */

/** 缓存文件路径 */
export function akashaCacheFile (uid) {
  return path.join(akashaCacheDir, `${uid}.json`)
}

/** 读缓存（过期或损坏返回 null） */
export function readAkashaCache (uid, ttlMinutes = getAkashaCacheTtlMinutes()) {
  try {
    const json = JSON.parse(fs.readFileSync(akashaCacheFile(uid), 'utf8'))
    if (!json?.fetchedAt) return null
    if (!json.account && !json.calculations) return null
    if (Date.now() - json.fetchedAt > ttlMinutes * 60 * 1000) return null
    return json
  } catch {
    return null
  }
}

/** 写缓存 */
export function writeAkashaCache (uid, payload) {
  try {
    fs.mkdirSync(akashaCacheDir, { recursive: true })
    fs.writeFileSync(akashaCacheFile(uid), JSON.stringify({ ...payload, fetchedAt: Date.now() }), 'utf8')
    return true
  } catch {
    return false
  }
}

/** 清缓存（测试与人工排查用） */
export function clearAkashaCache (uid) {
  try {
    if (uid) fs.rmSync(akashaCacheFile(uid), { force: true })
    else fs.rmSync(akashaCacheDir, { recursive: true, force: true })
  } catch { /* 忽略 */ }
}

/* ===================== 两个业务端点 ===================== */

/**
 * 账号信息
 * @param {string} uid
 * @param {object} [opts] - { force, transport, timeoutMs, proxy }
 * @returns {Promise<object>} `data.account`
 */
export async function fetchAkashaAccount (uid, opts = {}) {
  const json = await akashaGet(`user/${uid}`, {}, opts)
  const account = json?.data?.account
  if (!account) throw akashaError(AKASHA_ERROR.notFound, 'akasha 没有返回账号数据（可能未收录该 UID）')
  return account
}

/**
 * 角色练度（名次 / 伤害 / 赛道）
 * @param {string} uid
 * @param {object} [opts]
 * @returns {Promise<object[]>} `data`
 */
export async function fetchAkashaCalculations (uid, opts = {}) {
  const json = await akashaGet(`getCalculationsForUser/${uid}`, {}, opts)
  return Array.isArray(json?.data) ? json.data : []
}

/**
 * 批量中文化（akasha 的角色/武器/套装名默认是英文）
 * @param {string[]} words
 * @param {object} [opts]
 * @returns {Promise<Object<string,string>>} 小写原文 → 中文
 */
export async function fetchAkashaTranslations (words, opts = {}) {
  const list = [...new Set((words || []).filter(Boolean))]
  if (!list.length) return {}
  const json = await akashaGet(`textmap/${AKASHA_LANG}`, { 'words[]': list }, opts)
  return json?.translation || json?.data?.translation || {}
}

/**
 * 取一个 UID 的练度数据（账号 + 角色），带磁盘缓存
 * @param {string} uid
 * @param {object} [opts] - { force, translate, transport, timeoutMs, proxy }
 * @returns {Promise<{uid: string, account: object, calculations: object[], cached: boolean, fetchedAt: number}>}
 */
export async function fetchAkashaProfile (uid, opts = {}) {
  if (!opts.force) {
    const hit = readAkashaCache(uid)
    if (hit) return { uid: String(uid), account: hit.account, calculations: hit.calculations || [], cached: true, fetchedAt: hit.fetchedAt }
  }
  const [account, calculations] = await Promise.all([
    fetchAkashaAccount(uid, opts),
    fetchAkashaCalculations(uid, opts)
  ])
  writeAkashaCache(uid, { account, calculations })
  return { uid: String(uid), account, calculations, cached: false, fetchedAt: Date.now() }
}

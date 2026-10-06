/**
 * TeamStore — 榜单数据的拉取、落盘与内存缓存
 *
 * 数据源（见 components/constants.js 的 API_PATH）：
 *   /api/teams   —— DPS 数据库配队收录
 *   /api/teams2  —— 危战榜单
 * 两个接口都是「一次返回全量」，故策略是：落盘 JSON + 内存常驻 + TTL 过期后惰性重拉。
 * 查询路径永远读内存（不阻塞消息处理），只有过期或手动 `#DPS更新` 时才发网络请求。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pluginRoot, getCacheTtlMinutes, getTimeoutMs } from '../components/config.js'
import { API_PATH, CACHE_FILE, SITE_ORIGIN } from '../components/constants.js'
import { fetchJson } from './MhydpsClient.js'

/**
 * 缓存目录（gitignore）
 * `MHYDPS_DATA_DIR` 可指向别处：回归套件用它在临时目录里跑缓存读写，
 * 不碰仓库里的 data/
 */
export const dataDir = process.env.MHYDPS_DATA_DIR
  ? path.resolve(process.env.MHYDPS_DATA_DIR)
  : path.join(pluginRoot, 'data')

/** 内存状态 */
const state = {
  teams: [],
  teams2: [],
  meta: { fetchedAt: 0, teams: 0, teams2: 0, source: SITE_ORIGIN }
}

/** 是否已尝试从磁盘加载 */
let loaded = false

/** 进行中的刷新（并发调用共享同一次网络请求） */
let inflight = null

/** 数字兜底 */
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 确保 data 目录存在 */
function ensureDataDir () {
  fs.mkdirSync(dataDir, { recursive: true })
}

/** 读一个缓存文件，缺失或损坏返回 null */
function readCache (file) {
  const p = path.join(dataDir, file)
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (err) {
    logger?.warn?.(`[Mhydps] 缓存文件损坏（${file}）：${err.message}`)
    return null
  }
}

/** 原子写缓存文件 */
function writeCache (file, json) {
  ensureDataDir()
  const dest = path.join(dataDir, file)
  const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(json), 'utf8')
  fs.renameSync(tmp, dest)
}

/**
 * 归一化 /api/teams 记录
 * 只保留查询与渲染用得上的字段，剔除站点侧的编辑态字段（user 等）
 * @param {Array} raw
 * @returns {object[]}
 */
export function normalizeTeams (raw) {
  if (!Array.isArray(raw)) throw new Error('/api/teams 返回结构异常：应为数组')
  return raw
    .filter(t => t && Array.isArray(t.members) && t.members.length > 0)
    .map(t => ({
      id: String(t.id ?? ''),
      damage: num(t.damage),
      // 站点口径：cost = limitcost + normalcost（实测 1394/1394 成立）
      cost: num(t.cost),
      limitcost: num(t.limitcost),
      normalcost: num(t.normalcost),
      clean: t.clean === true,
      lvl: t.lvl === true,
      confirm: t.confirm !== false,
      tags: Array.isArray(t.tags) ? t.tags.filter(Boolean).map(String) : [],
      video: String(t.video_url || ''),
      info: String(t.info || ''),
      members: t.members
        .filter(m => m && m.charId)
        .map(m => ({ charId: String(m.charId).trim(), constellation: num(m.constellation) }))
    }))
}

/**
 * 归一化 /api/teams2 记录（危战榜单：多 version / boss / speed 字段）
 * @param {Array} raw
 * @returns {object[]}
 */
export function normalizeTeams2 (raw) {
  if (!Array.isArray(raw)) throw new Error('/api/teams2 返回结构异常：应为数组')
  return raw
    .filter(t => t && Array.isArray(t.members) && t.members.length > 0)
    .map(t => ({
      id: String(t.id ?? ''),
      speed: num(t.speed),
      ver: String(t.ver || ''),
      boss: num(t.boss),
      cost: num(t.cost),
      limitcost: num(t.limitcost),
      normalcost: num(t.normalcost),
      clean: t.clean === true,
      lvl: t.lvl === true,
      confirm: t.confirm !== false,
      video: String(t.video_url || ''),
      members: t.members
        .filter(m => m && m.charId)
        .map(m => ({ charId: String(m.charId).trim(), constellation: num(m.constellation) }))
    }))
}

/**
 * 从磁盘加载缓存到内存（不发网络请求）
 * 插件启动时调用：让首次查询就有数据可用，哪怕已经过期
 * @returns {{ teams: number, teams2: number, fetchedAt: number }}
 */
export function loadFromDisk () {
  loaded = true
  const teams = readCache(CACHE_FILE.teams)
  const teams2 = readCache(CACHE_FILE.teams2)
  const meta = readCache(CACHE_FILE.meta)

  if (Array.isArray(teams)) state.teams = normalizeTeams(teams)
  if (Array.isArray(teams2)) state.teams2 = normalizeTeams2(teams2)
  if (meta && typeof meta === 'object') {
    state.meta = {
      fetchedAt: num(meta.fetchedAt),
      teams: num(meta.teams),
      teams2: num(meta.teams2),
      source: String(meta.source || SITE_ORIGIN)
    }
  }
  return { teams: state.teams.length, teams2: state.teams2.length, fetchedAt: state.meta.fetchedAt }
}

/** 惰性加载（查询路径第一次进来时兜底） */
function ensureLoaded () {
  if (!loaded) loadFromDisk()
}

/** 当前快照（只读语义，调用方不要改数组内容） */
export function getSnapshot () {
  ensureLoaded()
  return state
}

/** 数据条目统计（状态页用） */
export function getCounts () {
  ensureLoaded()
  return { teams: state.teams.length, teams2: state.teams2.length }
}

/** 缓存是否过期（没有数据也算过期） */
export function isStale () {
  ensureLoaded()
  if (!state.meta.fetchedAt || !state.teams.length) return true
  return Date.now() - state.meta.fetchedAt > getCacheTtlMinutes() * 60000
}

/**
 * 拉取两个接口并落盘
 * @param {object} [opts]
 * @param {string} [opts.proxy] - 代理地址，默认读配置
 * @param {number} [opts.timeoutMs] - 单次请求超时
 * @returns {Promise<{ ok: boolean, counts?: object, fetchedAt?: number, error?: string, ms?: number }>}
 */
export async function refresh (opts = {}) {
  // 并发调用共享同一次刷新，避免同时打两个全量请求
  if (inflight) return await inflight

  const started = Date.now()
  const proxy = opts.proxy
  const timeoutMs = opts.timeoutMs || getTimeoutMs()

  inflight = (async () => {
    try {
      const [rawTeams, rawTeams2] = await Promise.all([
        fetchJson(API_PATH.teams, { proxy, timeoutMs }),
        fetchJson(API_PATH.teams2, { proxy, timeoutMs })
      ])
      const teams = normalizeTeams(rawTeams)
      const teams2 = normalizeTeams2(rawTeams2)
      if (!teams.length) throw new Error('/api/teams 返回空列表，站点可能改版或数据被清空')

      const fetchedAt = Date.now()
      const meta = { fetchedAt, teams: teams.length, teams2: teams2.length, source: SITE_ORIGIN }

      writeCache(CACHE_FILE.teams, teams)
      writeCache(CACHE_FILE.teams2, teams2)
      writeCache(CACHE_FILE.meta, meta)

      state.teams = teams
      state.teams2 = teams2
      state.meta = meta
      loaded = true

      return { ok: true, counts: { teams: teams.length, teams2: teams2.length }, fetchedAt, ms: Date.now() - started }
    } catch (err) {
      logger?.warn?.(`[Mhydps] 榜单数据刷新失败：${err.message}`)
      return { ok: false, error: err.message, ms: Date.now() - started }
    } finally {
      inflight = null
    }
  })()

  return await inflight
}

/**
 * 保证数据可用：无数据或已过期时刷新
 * @param {object} [opts] - 同 refresh
 * @returns {Promise<{ refreshed: boolean, ok: boolean, error?: string }>}
 */
export async function ensureFresh (opts = {}) {
  ensureLoaded()
  if (!isStale()) return { refreshed: false, ok: true }
  const ret = await refresh(opts)
  return { refreshed: true, ok: ret.ok, error: ret.error }
}

/** 数据时间与缓存年龄（状态页与页脚用） */
export function cacheInfo () {
  ensureLoaded()
  const fetchedAt = state.meta.fetchedAt
  return {
    fetchedAt,
    ageMs: fetchedAt ? Date.now() - fetchedAt : NaN,
    ttlMinutes: getCacheTtlMinutes(),
    stale: isStale(),
    source: state.meta.source || SITE_ORIGIN
  }
}

/** 清空内存与磁盘缓存（测试用） */
export function resetStore () {
  state.teams = []
  state.teams2 = []
  state.meta = { fetchedAt: 0, teams: 0, teams2: 0, source: SITE_ORIGIN }
  loaded = false
  inflight = null
}

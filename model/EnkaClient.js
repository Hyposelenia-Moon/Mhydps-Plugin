/**
 * EnkaClient — 练度查询数据（站点代理 Enka API）
 *
 * 站点自己提供 `/api/enka/uid/<uid>`，把 Enka 的玩家数据原样透传（实测返回 Enka 标准 JSON：
 * playerInfo / avatarInfoList / ttl / uid / region）。走站点代理的好处是不用再自己处理
 * Enka 的 UA 要求与限流，代价是多一次转发。
 * 本文件只负责取数与错误翻译，字段解读放在 modules/buildQuery.js。
 */
import { enkaPath } from '../components/constants.js'
import { httpGet, siteUrl } from './MhydpsClient.js'

/** 国服 UID 形态：9 位数字 */
export const UID_RE = /^\d{9}$/

/**
 * 练度接口的绝对地址
 *
 * `httpGet` 收的是绝对地址（内部直接 `new URL()`），所以这里必须先把相对路径补成站点全地址。
 * @param {string} uid - 9 位数字
 * @returns {string}
 */
export function enkaUrl (uid) {
  return siteUrl(enkaPath(uid))
}

/**
 * 把 HTTP 状态翻译成用户能看懂的错误
 * @param {number} status
 * @returns {string}
 */
function statusText (status) {
  if (status === 404) return 'Enka 未收录该 UID（确认 UID 正确且游戏内「角色详情」已公开）'
  if (status === 424) return 'Enka 服务维护中，请稍后再试'
  if (status === 429) return '请求过于频繁，请稍后再试'
  if (status === 403) return '站点拒绝访问（403），可能是 Referer 校验或站点策略变化'
  return `请求失败（HTTP ${status}）`
}

/**
 * 拉取玩家数据
 * @param {string} uid - 9 位数字
 * @param {object} [opts] - 同 httpGet（proxy / timeoutMs）
 * @returns {Promise<object>} Enka 原始 JSON
 * @throws {Error} UID 非法或站点/Enka 侧错误
 */
export async function fetchPlayer (uid, opts = {}) {
  const id = String(uid ?? '').trim()
  if (!UID_RE.test(id)) throw new Error('UID 应为 9 位数字，例如 #DPS练度查询 100000000')

  const res = await httpGet(enkaUrl(id), opts)
  if (res.statusCode !== 200) throw new Error(statusText(res.statusCode))

  let data
  try {
    data = JSON.parse(res.buffer.toString('utf8'))
  } catch (err) {
    throw new Error(`响应不是合法 JSON：${err.message}`)
  }
  if (!data || typeof data !== 'object') throw new Error('Enka 返回结构异常')

  return data
}

/**
 * 取玩家基本信息（无角色详情时也能展示的部分）
 * @param {object} data - Enka 原始 JSON
 * @returns {{ uid: string, nickname: string, level: number, worldLevel: number, region: string, avatarCount: number }}
 */
export function readPlayer (data) {
  const info = data?.playerInfo || {}
  return {
    uid: String(data?.uid || ''),
    nickname: String(info.nickname || '未知玩家'),
    level: Number(info.level) || 0,
    worldLevel: Number(info.worldLevel) || 0,
    region: String(data?.region || ''),
    avatarCount: Array.isArray(data?.avatarInfoList) ? data.avatarInfoList.length : 0
  }
}

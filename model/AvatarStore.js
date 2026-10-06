/**
 * AvatarStore — 角色立绘缓存
 *
 * 站点自托管角色立绘：`https://www.mhydps.cn/charactor/<character_id>.webp`（实测约 30 KB/张）。
 * 渲染成图时浏览器只在本地找图，所以这里负责把用到的立绘按需抓到 data/avatar/ 下。
 * 抓不到不影响功能：模板在 `avatar` 为空时渲染文字占位，不会出现裂图。
 */
import fs from 'node:fs'
import path from 'node:path'
import { getTimeoutMs } from '../components/config.js'
import { AVATAR_DIR, avatarUrl } from '../components/constants.js'
import { downloadTo } from './MhydpsClient.js'
import { dataDir } from './TeamStore.js'

/** 立绘缓存目录（data/avatar/，gitignore；受 MHYDPS_DATA_DIR 影响） */
export const avatarDir = path.join(dataDir, AVATAR_DIR)

/** 单张立绘路径 */
export function avatarFile (id) {
  return path.join(avatarDir, `${String(id)}.webp`)
}

/** 是否已缓存（文件存在且非空） */
export function hasAvatar (id) {
  try {
    const p = avatarFile(id)
    return fs.existsSync(p) && fs.statSync(p).size > 0
  } catch {
    return false
  }
}

/** 已缓存的立绘 id 集合 */
export function cachedIds () {
  try {
    return new Set(fs.readdirSync(avatarDir)
      .filter(f => f.endsWith('.webp'))
      .map(f => f.replace(/\.webp$/, '')))
  } catch {
    return new Set()
  }
}

/**
 * 缓存统计
 * @param {Array<string|number>} [ids] - 关心的 id 列表；不传则统计全部已缓存数量
 * @returns {{ total: number, cached: number }}
 */
export function avatarStats (ids) {
  if (!Array.isArray(ids)) {
    const n = cachedIds().size
    return { total: n, cached: n }
  }
  const uniq = [...new Set(ids.map(String).filter(Boolean))]
  return { total: uniq.length, cached: uniq.filter(hasAvatar).length }
}

/**
 * 确保这些立绘已缓存（缺哪张抓哪张）
 * @param {Array<string|number>} ids - character_id 列表
 * @param {object} [opts]
 * @param {string} [opts.proxy] - 代理地址，默认读配置
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.concurrency] - 并发下载数，默认 4
 * @returns {Promise<{ total: number, cached: number, downloaded: number, failed: number }>}
 */
export async function ensureAvatars (ids, opts = {}) {
  const uniq = [...new Set((ids || []).map(String).filter(Boolean))]
  const concurrency = Math.max(1, Math.min(8, opts.concurrency || 4))
  const timeoutMs = opts.timeoutMs || getTimeoutMs()

  let downloaded = 0
  let failed = 0
  const queue = uniq.filter(id => !hasAvatar(id))

  const worker = async () => {
    while (queue.length) {
      const id = queue.shift()
      try {
        await downloadTo(avatarUrl(id), avatarFile(id), { proxy: opts.proxy, timeoutMs })
        downloaded++
      } catch (err) {
        failed++
        logger?.debug?.(`[Mhydps] 立绘下载失败 ${id}: ${err.message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))

  return { total: uniq.length, cached: uniq.filter(hasAvatar).length, downloaded, failed }
}

/** 清空立绘缓存（测试用） */
export function resetAvatars () {
  try {
    fs.rmSync(avatarDir, { recursive: true, force: true })
  } catch { /* 目录不存在时忽略 */ }
}

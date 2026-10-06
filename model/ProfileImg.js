/**
 * ProfileImg — 面板立绘图库（ProfileImg 图库，community fan art）
 *
 * 面板的版式与其余素材全部由 miao-plugin 提供（见 model/MiaoBridge.js），本文件只解决
 * 「这块立绘用哪张图」：miao 自己的 `costumeSplash` 是官方立绘，而这里用的是
 * AxiuCN/miao-plugin-ProfileImg 图库里按**角色名**归档的插画。
 *
 * 两条约束：
 *   1) **图库不入库**：300MB+ 且图库 README 明确「严禁商用」，本插件是 GPL 仓库，
 *      只按路径只读引用本机已安装的图库，没有图库时返回空串（miao 会退回它自己的官方立绘）。
 *   2) **同一角色每次同一张**：按 seed（UID/角色名）稳定哈希取图，避免每次刷新换图。
 *
 * 目录布局（兼容两种）：
 *   <图库根>/normal-character/<角色名>/<角色名>_N_作者_来源.webp
 *   <图库根>/normal-character/<角色名>.webp
 */
import fs from 'node:fs'
import path from 'node:path'
import { getPluginConfig } from '../components/config.js'

/** 支持的图片后缀（按优先级） */
const IMG_EXT = ['.webp', '.png', '.jpg', '.jpeg']

/** 本机图库默认位置（相对 bot 根目录） */
const DEFAULT_PROFILE_IMG = 'plugins/ProfileImg-Plugin/resources/gallery/ProfileImg/miao-plugin-ProfileImg'
const DEFAULT_MIAO_PROFILE = 'plugins/miao-plugin/resources/profile'

/** 目录是否可用 */
function isDir (p) {
  try {
    return Boolean(p) && fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

/**
 * 面板立绘图库根目录（含 normal-character 的那一层）
 * 探测顺序：环境变量（测试用）→ 配置 profileImgDir → 本机默认路径
 * @returns {string} 绝对路径；未安装图库时为空串
 */
export function profileImgDir () {
  const cwd = process.cwd()
  const fromConfig = String(getPluginConfig()?.profileImgDir || '').trim()
  const candidates = [
    process.env.MHYDPS_PROFILE_IMG,
    fromConfig && path.resolve(fromConfig),
    path.join(cwd, DEFAULT_PROFILE_IMG),
    path.join(cwd, DEFAULT_MIAO_PROFILE)
  ]
  for (const p of candidates) {
    if (isDir(p)) return path.resolve(p)
  }
  return ''
}

/** 稳定哈希（同一角色每次选到同一张图） */
function stableHash (text) {
  let h = 2166136261
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** 目录下按名字升序列出图片（顺序稳定，选图才可复现） */
function listImages (dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => IMG_EXT.includes(path.extname(f).toLowerCase()))
      .filter(f => !f.startsWith('.'))
      .sort((a, b) => a.localeCompare(b, 'zh'))
      .map(f => path.join(dir, f))
  } catch {
    return []
  }
}

/**
 * 图库里某角色的全部立绘
 * @param {string} name - 角色名（与图库命名一致）
 * @returns {string[]} 绝对路径列表（可能为空）
 */
export function profileImagesOf (name) {
  const root = profileImgDir()
  if (!root || !name) return []
  for (const base of [path.join(root, 'normal-character'), root]) {
    const dir = path.join(base, String(name))
    if (isDir(dir)) {
      const files = listImages(dir)
      if (files.length) return files
    }
    const files = IMG_EXT
      .map(ext => path.join(base, `${name}${ext}`))
      .filter(p => { try { return fs.statSync(p).isFile() } catch { return false } })
    if (files.length) return files
  }
  return []
}

/**
 * 为角色选一张面板立绘（同一 seed 恒选同一张）
 * @param {string} name - 角色名
 * @param {string|number} [seed] - 稳定种子，默认用角色名
 * @returns {string} 绝对路径；图库缺失或未收录该角色时为空串
 */
export function pickProfileImage (name, seed) {
  const files = profileImagesOf(name)
  if (!files.length) return ''
  return files[stableHash(seed ?? name) % files.length]
}

/**
 * PanelAssets — 练度面板的「风格化素材」：面板立绘、命座 / 武器 / 圣遗物图标
 *
 * 面板版式照 miao-plugin（AxiuCN 版）的 profile-detail，素材来源也沿用它的约定：
 *   面板立绘  <图库根>/normal-character/<角色名>/<角色名>_N_….webp（ProfileImg 图库，可多张）
 *   命座图标  <miao>/resources/meta-gs/character/<角色名>/icons/cons-<1..6>.webp
 *   武器图标  <miao>/resources/meta-gs/weapon/<类型>/<武器名>/icon.webp
 *   圣遗物图  <miao>/resources/meta-gs/artifact/imgs/<套装名>/<部位序号>.webp
 *
 * 两条硬约束：
 *   1) **素材一律不入库**。图库 313MB 且其 README 明确「严禁商用」，本插件是 GPL 仓库，只能
 *      只读引用本机已安装的图库 / miao-plugin 目录。仓库里只留代码与降级逻辑。
 *   2) **缺什么都能出图**。图库缺失 → 退回站点立绘（AvatarStore 已缓存）；图标缺失 → 整块不显示图标。
 *
 * 目录探测顺序：环境变量（测试用）→ 配置项 → 本机默认路径。任一步缺失都返回空串，不抛错。
 */
import fs from 'node:fs'
import path from 'node:path'
import { getPluginConfig } from '../components/config.js'
import { avatarDir, hasAvatar } from './AvatarStore.js'
import { dataDir } from './TeamStore.js'

/** 面板素材缓存目录（data/panel/，gitignore，受 MHYDPS_DATA_DIR 影响） */
export const panelDir = path.join(dataDir, 'panel')

/** 图库 / miao 资源的本机默认位置（相对 bot 根目录） */
const DEFAULT_PROFILE_IMG = 'plugins/ProfileImg-Plugin/resources/gallery/ProfileImg/miao-plugin-ProfileImg'
const DEFAULT_MIAO_PROFILE = 'plugins/miao-plugin/resources/profile'
const DEFAULT_MIAO_RES = 'plugins/miao-plugin/resources'

/** 支持的图片后缀（按优先级） */
const IMG_EXT = ['.webp', '.png', '.jpg', '.jpeg']

/** 武器类型目录（miao 按类型分子目录，未知类型时逐个找） */
const WEAPON_TYPES = ['sword', 'claymore', 'polearm', 'bow', 'catalyst']

/** 目录是否可用：存在且是目录 */
function isDir (p) {
  try {
    return Boolean(p) && fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** 候选路径里第一个存在的目录 */
function firstDir (list) {
  for (const p of list) {
    if (isDir(p)) return path.resolve(p)
  }
  return ''
}

/**
 * 面板立绘图库根目录（含 normal-character 的那一层）
 * @returns {string} 绝对路径；未安装图库时为空串
 */
export function profileImgDir () {
  const cwd = process.cwd()
  const fromConfig = String(getPluginConfig()?.profileImgDir || '').trim()
  return firstDir([
    process.env.MHYDPS_PROFILE_IMG,
    fromConfig && path.resolve(fromConfig),
    path.join(cwd, DEFAULT_PROFILE_IMG),
    path.join(cwd, DEFAULT_MIAO_PROFILE)
  ])
}

/**
 * miao-plugin 的 resources 根目录（图标来源）
 * @returns {string} 绝对路径；未安装 miao-plugin 时为空串
 */
export function miaoResDir () {
  const cwd = process.cwd()
  const fromConfig = String(getPluginConfig()?.miaoResDir || '').trim()
  const candidates = [
    process.env.MHYDPS_MIAO_RES,
    fromConfig && path.resolve(fromConfig),
    path.join(cwd, DEFAULT_MIAO_RES)
  ]
  for (const p of candidates) {
    if (isDir(p) && isDir(path.join(p, 'meta-gs', 'character'))) return path.resolve(p)
  }
  return ''
}

/** 稳定哈希（同一个角色每次选到同一张图；与 avatarId 绑定） */
function stableHash (text) {
  let h = 2166136261
  for (const ch of String(text)) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/** 列出目录下指定后缀的图片文件（名字升序，保证可复现） */
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
 * 图库根目录下某角色的全部立绘
 * 兼容两种布局：`normal-character/<角色名>/`（目录）与 `normal-character/<角色名>.webp`（单文件）
 * @param {string} name - 角色名（本站角色表的 name，与图库命名一致）
 * @returns {string[]} 绝对路径列表（可能为空）
 */
export function profileImagesOf (name) {
  const root = profileImgDir()
  if (!root || !name) return []
  const bases = [path.join(root, 'normal-character'), root]
  for (const base of bases) {
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
 * @returns {string} 绝对路径；图库缺失时为空串
 */
export function pickProfileImage (name, seed) {
  const files = profileImagesOf(name)
  if (!files.length) return ''
  return files[stableHash(seed ?? name) % files.length]
}

/** 单个文件存在且非空 */
function isFile (p) {
  try {
    return Boolean(p) && fs.statSync(p).size > 0
  } catch {
    return false
  }
}

/** miao 角色资源目录（meta-gs/character/<角色名>） */
function miaoCharDir (name) {
  const res = miaoResDir()
  if (!res || !name) return ''
  const dir = path.join(res, 'meta-gs', 'character', String(name))
  return isDir(dir) ? dir : ''
}

/**
 * 命座图标
 * @param {string} name - 角色名
 * @param {number} n - 1~6
 * @returns {string} 绝对路径；缺失为空串
 */
export function consIcon (name, n) {
  const dir = miaoCharDir(name)
  if (!dir) return ''
  const p = path.join(dir, 'icons', `cons-${n}.webp`)
  return isFile(p) ? p : ''
}

/**
 * 角色官方立绘（图库没有该角色时的备选）
 * @param {string} name
 * @returns {string}
 */
export function splashImage (name) {
  const dir = miaoCharDir(name)
  if (!dir) return ''
  for (const f of ['splash.webp', 'splash2.webp']) {
    const p = path.join(dir, 'imgs', f)
    if (isFile(p)) return p
  }
  return ''
}

/**
 * 武器图标（按名字跨 5 类武器目录找）
 * @param {string} weaponName
 * @returns {string}
 */
export function weaponIcon (weaponName) {
  const res = miaoResDir()
  if (!res || !weaponName) return ''
  for (const type of WEAPON_TYPES) {
    const p = path.join(res, 'meta-gs', 'weapon', type, String(weaponName), 'icon.webp')
    if (isFile(p)) return p
  }
  return ''
}

/** 圣遗物「部件名 → 套装名 + 部位序号」表（惰性加载 miao 的 artifact/data.json） */
let artisIndex = null

function artifactIndexOf (pieceName) {
  const res = miaoResDir()
  if (!res || !pieceName) return null
  if (artisIndex === null) {
    artisIndex = new Map()
    try {
      const raw = fs.readFileSync(path.join(res, 'meta-gs', 'artifact', 'data.json'), 'utf8')
      for (const set of Object.values(JSON.parse(raw))) {
        for (const [idx, item] of Object.entries(set?.idxs || {})) {
          if (item?.name && !artisIndex.has(item.name)) {
            artisIndex.set(item.name, { set: set.name, idx: Number(idx) })
          }
        }
      }
    } catch {
      artisIndex = new Map()
    }
  }
  return artisIndex.get(String(pieceName)) || null
}

/**
 * 圣遗物图标（按部件名反查套装，再取 `imgs/<套装名>/<部位序号>.webp`）
 * @param {string} pieceName - Enka 的 `flat.name`（部件名，如 魔女的炎之花）
 * @returns {string}
 */
export function artifactIcon (pieceName) {
  const res = miaoResDir()
  const hit = artifactIndexOf(pieceName)
  if (!res || !hit) return ''
  const p = path.join(res, 'meta-gs', 'artifact', 'imgs', hit.set, `${hit.idx}.webp`)
  return isFile(p) ? p : ''
}

/** 探测结果摘要（状态页展示用） */
export function assetSources () {
  return {
    profileImgDir: profileImgDir(),
    miaoResDir: miaoResDir(),
    panelDir
  }
}

/* ===================== miao 的静态文案 / 面板底纹（同样只读本地文件） ===================== */

/** 武器静态表缓存（按「类型」分组惰性加载）
 *  miao 的武器目录按类型分：meta-gs/weapon/<类型>/<武器名>/data.json */
let weaponIndex = null

function weaponDataOf (weaponName) {
  const res = miaoResDir()
  if (!res || !weaponName) return null
  if (weaponIndex === null) {
    weaponIndex = new Map()
    for (const type of WEAPON_TYPES) {
      const dir = path.join(res, 'meta-gs', 'weapon', type)
      let names = []
      try {
        names = fs.readdirSync(dir)
      } catch { continue }
      for (const name of names) {
        const file = path.join(dir, name, 'data.json')
        if (!isFile(file) || weaponIndex.has(name)) continue
        try {
          weaponIndex.set(name, JSON.parse(fs.readFileSync(file, 'utf8')))
        } catch { /* 单条数据坏掉不影响其它武器 */ }
      }
    }
  }
  return weaponIndex.get(String(weaponName)) || null
}

/**
 * 武器文案（副标题 / 说明 / 精炼被动）
 *
 * 文案来自本机 miao-plugin 的静态表（游戏内原文），缺失时返回 null —— 模板整块不渲染。
 * 被动的 `$[n]` 占位符按当前精炼等级取对应档位，与游戏内展示一致。
 * @param {string} weaponName
 * @param {number} refine - 1~5
 * @returns {{title: string, desc: string, passive: string}|null}
 */
export function weaponDetail (weaponName, refine = 1) {
  const data = weaponDataOf(weaponName)
  if (!data) return null
  const affix = data.affixData || {}
  let passive = String(affix.text || '')
  const idx = Math.min(4, Math.max(0, (Number(refine) || 1) - 1))
  passive = passive.replace(/\$\[(\d+)]/g, (all, n) => {
    const row = affix.datas?.[n]
    return Array.isArray(row) ? (row[idx] ?? '') : all
  })
  return {
    title: String(data.affixTitle || ''),
    desc: String(data.desc || ''),
    passive
  }
}

/**
 * 面板共用素材（miao 的底纹 / 星级 / 属性图标雪碧图）复制进 data/panel/
 * 它们是 miao-plugin（MIT）的小文件，同样不入库，只在本机存在时复制使用。
 * @returns {{ cardBg: string, star: string, icons: string }}
 */
export function prepareSharedAssets () {
  const res = miaoResDir()
  if (!res) return { cardBg: '', star: '', icons: '' }
  return {
    cardBg: cacheCopy(path.join(res, 'common', 'cont', 'card-bg.png'), 'card-bg'),
    star: cacheCopy(path.join(res, 'common', 'item', 'star.png'), 'star'),
    icons: cacheCopy(path.join(res, 'character', 'imgs', 'icon.png'), 'icons')
  }
}

/** 清空面板素材缓存（测试用） */
export function resetPanelAssets () {
  artisIndex = null
  weaponIndex = null
  try {
    fs.rmSync(panelDir, { recursive: true, force: true })
  } catch { /* 目录不存在时忽略 */ }
}

/* ===================== 复制进 data/panel/，供模板用 _data_path 引用 ===================== */

/** 把源文件复制成 data/panel/<目标名>（已存在则跳过），返回文件名；失败返回空串 */
function cacheCopy (src, targetName) {
  if (!isFile(src)) return ''
  try {
    fs.mkdirSync(panelDir, { recursive: true })
    const ext = path.extname(src).toLowerCase() || '.webp'
    const finalName = `${targetName}${ext}`
    const finalPath = path.join(panelDir, finalName)
    if (!isFile(finalPath)) fs.copyFileSync(src, finalPath)
    return finalName
  } catch {
    return ''
  }
}

/**
 * 为一个角色准备面板素材，返回模板可直接拼 `{{_data_path}}/panel/` 的文件名
 *
 * 立绘优先级：图库立绘 → miao 官方立绘 → 站点立绘（AvatarStore 已缓存）→ 空（模板显示纯色头图）
 * @param {object} char - { avatarId, name, weaponName, artifacts: [{ name }] }
 * @returns {{ bg: string, cons: Array<{ n: number, icon: string, on: boolean }>, weapon: string, artifacts: string[] }}
 */
export function preparePanelAssets (char = {}) {
  const id = String(char.avatarId || '') || 'unknown'
  const name = char.name || ''

  let bgSource = pickProfileImage(name, id)
  if (!bgSource) bgSource = splashImage(name)
  if (!bgSource && hasAvatar(id)) bgSource = path.join(avatarDir, `${id}.webp`)

  const cons = [1, 2, 3, 4, 5, 6].map(n => ({
    n,
    icon: cacheCopy(consIcon(name, n), `cons-${id}-${n}`),
    on: n <= (Number(char.constellation) || 0)
  }))

  const artifacts = (char.artifacts || []).map(a => artifactIcon(a?.name))

  return {
    bg: cacheCopy(bgSource, `bg-${id}`),
    cons,
    weapon: cacheCopy(weaponIcon(char.weaponName), `weapon-${id}`),
    artifacts: artifacts.map((src, i) => cacheCopy(src, `arti-${id}-${i + 1}`))
  }
}

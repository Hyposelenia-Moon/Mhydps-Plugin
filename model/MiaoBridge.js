/**
 * MiaoBridge — 练度面板「完全复用 miao-plugin（AxiuCN 版）的代码」
 *
 * 面板这一页不再由本插件自绘：版式、图标、圣遗物评分与词条统计全部由 miao-plugin 自己的代码产出，
 * 我们只负责两件事 —— 用本站（mhydps.cn 代理）的 Enka 数据喂给它，以及决定面板立绘用哪张。
 *
 * 复用的具体对象（都是 miao 的原文件，按绝对路径动态 import，跟着 miao 升级走）：
 *   models/index.js              Character / Player / Avatar / Weapon / Artifact
 *   models/serv/api/EnkaData.js  原始 Enka avatarInfo → miao 的 Avatar（**按 itemId 反查名字与图标**）
 *   components/index.js          Common.render（模板 + 布局 + 资源路径 + 截图）与 Format 数值格式
 *   resources/character/profile-detail.html/.css 面板模板与样式（由 Common.render 按 plugin 名解析）
 *
 * 关键点与边界：
 *   1) 名字/图标一律由 miao 按 **itemId** 解析（EnkaData.getWeapon/getArtifact），
 *      因此站点 Enka 代理没带 `flat.name` 的新角色/新武器也能正常显示 —— 这正是自绘版最大的毛病。
 *   2) 面板数值（attr/base）与圣遗物评分由 miao 的 Attr / ArtisMark 现算，我们不参与，也不伪造。
 *   3) 「伤害计算」表刻意不渲染：给 `dmgCalc.dmgData = []`，miao 模板里的 `{{if dmgData?.length > 0}}` 自然跳过。
 *   4) 用一个**独立的 Player 实例**（uid 加前缀）承载解析结果，绝不调用 `player.save()`，
 *      避免污染 miao 自己那份 PlayerData 缓存与内存实例。
 *   5) miao-plugin 缺失时整体降级：调用方回退纯文本（见 apps/build.js）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getPluginConfig } from '../components/config.js'

/** 本机 miao-plugin 目录（含 package.json 与 resources/），探测失败返回空串 */
export function miaoPluginDir () {
  const cwd = process.cwd()
  const candidates = [
    process.env.MHYDPS_MIAO_PLUGIN,
    String(getPluginConfig()?.miaoPluginDir || '').trim(),
    // 兼容只配了 miaoResDir（指向 .../miao-plugin/resources）的情况
    String(getPluginConfig()?.miaoResDir || '').trim().replace(/[\\/]resources[\\/]?$/, ''),
    path.join(cwd, 'plugins', 'miao-plugin')
  ]
  for (const p of candidates) {
    if (!p) continue
    const dir = path.resolve(p)
    if (fs.existsSync(path.join(dir, 'models', 'index.js')) && fs.existsSync(path.join(dir, 'resources', 'character', 'profile-detail.html'))) {
      return dir
    }
  }
  return ''
}

let loaded = null
let loadFailed = false
let loadError = ''

/** 上一次加载失败的原因（排查用；加载成功为空串） */
export function miaoLoadError () {
  return loadError
}

/**
 * 加载 miao 的模型与渲染入口（进程内只加载一次）
 * @returns {Promise<{dir: string, models: object, Common: object, Format: object, EnkaData: object}|null>}
 */
export async function loadMiao () {
  if (loaded) return loaded
  if (loadFailed) return null
  const dir = miaoPluginDir()
  if (!dir) {
    loadFailed = true
    return null
  }
  try {
    const url = (rel) => pathToFileURL(path.join(dir, rel)).href
    const models = await import(url('models/index.js'))
    const components = await import(url('components/index.js'))
    const enkaData = await import(url('models/serv/api/EnkaData.js'))
    loaded = {
      dir,
      models,
      Common: components.Common,
      Format: components.Format,
      EnkaData: enkaData.default
    }
    return loaded
  } catch (err) {
    loadError = String(err?.message || err)
    logger?.warn?.(`[Mhydps] 复用 miao-plugin 面板失败：${loadError}`)
    loadFailed = true
    return null
  }
}

/** 面板立绘（`.main-pic`）可以是不带协议的相对路径，所以这里统一转成 file:// 绝对地址 */
export function fileUrl (p) {
  return p ? pathToFileURL(p).href : ''
}

/**
 * 兼容处理：站点 Enka 代理给的是 `ival`，而 miao 的解析取 `val`
 * 另外补上 miao 会直接取用的字段，避免老数据缺字段时整块算不出来。
 * @param {object} raw - Enka avatarInfo
 * @returns {object} 归一化副本（不改原对象）
 */
export function normalizeAvatarInfo (raw = {}) {
  const out = { ...raw }
  const propMap = {}
  for (const [key, entry] of Object.entries(raw.propMap || {})) {
    propMap[key] = entry && entry.val == null && entry.ival != null
      ? { ...entry, val: String(entry.ival) }
      : entry
  }
  out.propMap = propMap
  if (!out.fetterInfo || out.fetterInfo.expLevel == null) out.fetterInfo = { ...(out.fetterInfo || {}), expLevel: 0 }
  return out
}

/**
 * 原始 Enka avatarInfo → miao 的 Avatar（名字/图标/属性/评分都由 miao 解析）
 * @param {string} uid
 * @param {object} rawAvatar - 站点代理返回的 avatarInfoList 元素
 * @returns {Promise<object|null>} miao 的 Avatar（`isProfile` 为真才可用于出图）
 */
export async function buildMiaoProfile (uid, rawAvatar) {
  const miao = await loadMiao()
  if (!miao) return null
  const { Player, Character } = miao.models
  const char = Character.get(rawAvatar?.avatarId)
  if (!char) return null
  // 独立实例：uid 前缀保证不会命中 miao 自己的 Player 缓存，也不落盘（全程不调 save）
  const player = new Player(`mhydps-${uid}`, 'gs')
  if (!player) return null
  player.uid = String(uid)
  const avatar = miao.EnkaData.setAvatar(player, normalizeAvatarInfo(rawAvatar), 'enka')
  if (!avatar || !avatar.isProfile) return null
  avatar.uid = String(uid)
  return avatar
}

/** 照搬 ProfileDetail.render 的属性格式化（GS 口径：四基础 + 双暴/充能/增伤，含 基础+加成 拆分） */
function buildAttr (profile, Format) {
  const attr = {}
  const a = profile.attr || {}
  const base = profile.base || {}
  const num = (n) => Number.isFinite(Number(n)) ? Number(n) : 0
  for (const key of ['hp', 'def', 'atk', 'mastery']) {
    const fn = (n) => Format.comma(num(n), key === 'hp' ? 0 : 1)
    attr[key] = fn(a[key])
    attr[`${key}Base`] = fn(base[key])
    attr[`${key}Plus`] = fn(num(a[key]) - num(base[key]))
  }
  for (const key of ['cpct', 'cdmg', 'recharge', 'dmg']) {
    let source = key
    if (key === 'dmg' && num(a.phy) > num(a.dmg)) source = 'phy'
    attr[key] = Format.pct(num(a[source]))
    attr[`${key}Base`] = Format.pct(num(base[source]))
    attr[`${key}Plus`] = Format.pct(num(a[source]) - num(base[source]))
  }
  return attr
}

/**
 * 组装 miao 面板模板需要的 renderData
 *
 * 结构照 `apps/profile/ProfileDetail.js` 的 `render()`（只保留 GS 面板需要的部分）：
 * 与 miao 原版的差异只有三处 —— 不含排行、不含面板图上传入口、伤害计算传空。
 * @param {object} opts
 * @param {string} opts.uid
 * @param {object} opts.profile - miao 的 Avatar（buildMiaoProfile 的返回值）
 * @param {string} [opts.costumeSplash] - 面板立绘（file:// 绝对地址或 miao 的相对路径）
 * @returns {Promise<object|null>}
 */
export async function toPanelData ({ uid, profile, costumeSplash = '' }) {
  const miao = await loadMiao()
  if (!miao || !profile) return null
  const { Artifact } = miao.models

  const data = profile.getData('name,abbr,cons,level,talent,dataSource,updateTime,imgs,costumeSplash')
  if (costumeSplash) data.costumeSplash = costumeSplash
  data.weapon = profile.getWeaponDetail()

  const artisDetail = profile.getArtisMark()
  // miao 原版会把副词条统计补齐到 9 格，保证表格宽度稳定
  // （getAllAttr 在部分版本返回的是对象，这里统一成数组再补齐）
  const rawAllAttr = profile.artis?.getAllAttr?.()
  const allAttr = (Array.isArray(rawAllAttr) ? rawAllAttr : Object.values(rawAllAttr || {})).slice(0, 9)
  for (let i = allAttr.length; i < 9; i++) allAttr[i] = {}
  artisDetail.allAttr = allAttr

  return {
    save_id: uid,
    uid: String(uid),
    game: 'gs',
    data,
    attr: buildAttr(profile, miao.Format),
    elem: profile.char?.elem || profile.char?.element || '',
    hsr_paths: profile.char?.weapon || '',
    // 伤害计算：传空数组 → miao 模板里的 {{if dmgData?.length > 0}} 不成立，整块不渲染
    dmgCalc: { dmgData: [] },
    artisDetail,
    artisKeyTitle: Artifact.getArtisKeyTitle('gs'),
    bodyClass: `char-${profile.char?.name || ''}`,
    mode: 'profile',
    wCfg: {},
    changeProfile: false
  }
}

/**
 * 调 miao 自己的渲染入口出图（模板、布局、图标路径、截图缩放都用 miao 的）
 *
 * `Common.render` 的默认 retType 会直接回复图片并返回 true，所以调用方不需要再 reply。
 * @param {object} e - Yunzai 事件（需带 runtime）
 * @param {object} panelData - toPanelData 的返回值
 * @param {number} [scale] - 设备像素比，miao 面板用的是 1.6
 * @returns {Promise<boolean>}
 */
export async function renderMiaoPanel (e, panelData, scale = 1.6) {
  const miao = await loadMiao()
  if (!miao || !panelData) return false
  await miao.Common.render('character/profile-detail', panelData, { e, scale })
  return true
}

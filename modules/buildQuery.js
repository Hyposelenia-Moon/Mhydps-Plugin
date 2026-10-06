/**
 * buildQuery — 练度查询（Enka 数据 → 模板视图）
 *
 * 字段解读全部按 Enka 标准结构：
 *   avatarInfoList[].propMap['4001'].ival   角色等级
 *   avatarInfoList[].talentIdList           已解锁命座（长度即命座数）
 *   avatarInfoList[].skillLevelMap          天赋等级（键末位 1/2/3 = 普攻/战技/爆发）
 *   avatarInfoList[].fightPropMap           面板（20 暴击率 / 22 爆伤 / 23 充能 是 0~1 小数）
 *   avatarInfoList[].equipList              武器与圣遗物（flat.itemType 区分）
 * 站点自己那套「练度评分」是前端专有算法（按角色配置有效词条再加权），本插件不复刻，
 * 只给出面板与圣遗物明细 + 副词条条数，口径在 README 里写明。
 */
import { fetchPlayer, readPlayer } from '../model/EnkaClient.js'
import { characterById, elementCn } from '../model/CharacterIndex.js'
import { ensureAvatars, hasAvatar } from '../model/AvatarStore.js'
import { getPluginConfig } from '../components/config.js'
import {
  ENKA_PROP_CN,
  isPercentProp,
  EQUIP_SLOT_CN,
  EQUIP_SLOT_ORDER,
  PANEL_PROPS,
  TALENT_POSITION_CN,
  MAX_BUILD_CHARS
} from '../components/constants.js'

/** 数字文本：整数直接输出，小数保留一位 */
function numText (n) {
  if (!Number.isFinite(n)) return '-'
  return Number.isInteger(n) ? String(n) : n.toFixed(1)
}

/**
 * 圣遗物词条数值文本（Enka 给的百分比词条已经是 7.8 这样的数，不用再乘 100）
 * @param {string} prop - FIGHT_PROP_* 常量名
 * @param {number} value
 * @returns {string}
 */
export function artifactStatText (prop, value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  return isPercentProp(prop) ? `${numText(n)}%` : numText(Math.round(n))
}

/**
 * 面板数值文本（fightPropMap 里百分比项是 0~1 的小数）
 * @param {number} value
 * @param {boolean} percent
 * @returns {string}
 */
export function panelStatText (value, percent) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  return percent ? `${(n * 100).toFixed(1)}%` : numText(Math.round(n))
}

/** 属性名 → 中文标签 */
export function propLabel (prop) {
  return ENKA_PROP_CN[prop] || String(prop || '')
}

/**
 * 天赋等级：skillLevelMap 的键末位标识位次（1 普攻 / 2 战技 / 3 爆发）
 *
 * Enka 里同一角色可能有不止一套技能 id（多形态角色），这里取每个位次里 id 最小的一套，
 * 与站点前端展示的「三连数字」口径一致；纯启发式，见文件头说明。
 * @param {object} skillLevelMap
 * @returns {{ list: Array<{label: string, level: number}>, text: string }}
 */
export function readTalents (skillLevelMap = {}) {
  const entries = Object.entries(skillLevelMap || {})
    .map(([id, level]) => ({ id: String(id), level: Number(level) || 0 }))
    .sort((a, b) => a.id.localeCompare(b.id))

  const picked = new Map()
  for (const entry of entries) {
    const pos = Number(entry.id.slice(-1))
    if (TALENT_POSITION_CN[pos] && !picked.has(pos)) picked.set(pos, entry.level)
  }

  const list = [1, 2, 3]
    .filter(pos => picked.has(pos))
    .map(pos => ({ label: TALENT_POSITION_CN[pos], level: picked.get(pos) }))

  return { list, text: list.map(t => t.level).join('/') }
}

/**
 * 武器
 * @param {object} avatar - Enka avatarInfo
 * @returns {{name: string, level: number, refine: number, rarity: number}|null}
 */
export function readWeapon (avatar) {
  const item = (avatar?.equipList || []).find(i => i?.flat?.itemType === 'ITEM_WEAPON')
  if (!item) return null
  const affix = item.weapon?.affixMap ? Number(Object.values(item.weapon.affixMap)[0]) : 0
  return {
    name: String(item.flat.name || ''),
    level: Number(item.weapon?.level) || 0,
    // Enka 的精炼等级是 0 基（0 = 精一）
    refine: Number.isFinite(affix) ? affix + 1 : 1,
    rarity: Number(item.flat.rankLevel) || 5
  }
}

/**
 * 圣遗物（按 花/羽/沙/杯/冠 固定顺序）
 * @param {object} avatar
 * @returns {object[]}
 */
export function readArtifacts (avatar) {
  const list = (avatar?.equipList || []).filter(i => i?.flat?.itemType === 'ITEM_RELIQUARY')
  const bySlot = new Map(list.map(i => [i.flat.equipType, i]))

  return EQUIP_SLOT_ORDER
    .filter(slot => bySlot.has(slot))
    .map(slot => {
      const item = bySlot.get(slot)
      const main = item.flat.reliquaryMainstat || {}
      const subs = item.flat.reliquarySubstats || []
      return {
        slot: EQUIP_SLOT_CN[slot] || slot,
        name: String(item.flat.name || ''),
        rarity: Number(item.flat.rankLevel) || 5,
        // Enka 的圣遗物等级是 1 基（1 = 未强化），展示时减 1
        level: Math.max(0, (Number(item.reliquary?.level) || 1) - 1),
        mainLabel: propLabel(main.mainPropId),
        mainValue: artifactStatText(main.mainPropId, main.statValue),
        substats: subs.map(s => ({
          label: propLabel(s.appendPropId),
          value: artifactStatText(s.appendPropId, s.statValue)
        })),
        substatCount: subs.length
      }
    })
}

/**
 * 面板属性
 * @param {object} fightPropMap
 * @returns {Array<{label: string, value: string}>}
 */
export function readPanel (fightPropMap = {}) {
  return PANEL_PROPS.map(p => ({
    label: p.label,
    value: panelStatText(fightPropMap[p.key], p.percent)
  }))
}

/**
 * 单个角色 → 视图数据
 * @param {object} avatar - Enka avatarInfo
 * @returns {object}
 */
export function buildCharView (avatar) {
  const id = String(avatar?.avatarId ?? '')
  const record = characterById(avatar?.avatarId)
  const talents = readTalents(avatar?.skillLevelMap)

  return {
    name: record?.name || `#${id}`,
    avatar: id && hasAvatar(id) ? id : '',
    rarity: record?.rarity || 5,
    elementCn: elementCn(record?.element),
    level: Number(avatar?.propMap?.['4001']?.ival) || 0,
    constellation: Array.isArray(avatar?.talentIdList) ? avatar.talentIdList.length : 0,
    talents: talents.list,
    talentText: talents.text,
    weapon: readWeapon(avatar),
    stats: readPanel(avatar?.fightPropMap),
    artifacts: readArtifacts(avatar)
  }
}

/**
 * 查询练度
 * @param {string} uid - 9 位 UID
 * @param {object} [opts] - { proxy, timeoutMs, downloadAvatars }
 * @returns {Promise<object>}
 * @throws {Error} UID 非法 / Enka 侧错误（由 apps 层捕获后回复文本）
 */
export async function queryBuild (uid, opts = {}) {
  const data = await fetchPlayer(uid, opts)
  const player = readPlayer(data)
  const raw = Array.isArray(data?.avatarInfoList) ? data.avatarInfoList : []

  // 先补齐立绘再组装视图：buildCharView 依赖本地是否已有立绘决定 avatar 字段
  const avatarIds = raw.map(a => String(a?.avatarId ?? '')).filter(Boolean)
  const wantAvatar = opts.downloadAvatars !== false && getPluginConfig()?.avatarEnabled !== false
  let avatarStat = { total: avatarIds.length, cached: avatarIds.filter(hasAvatar).length, downloaded: 0, failed: 0 }
  if (wantAvatar && avatarIds.length) {
    avatarStat = await ensureAvatars(avatarIds, opts)
  }

  const chars = raw
    .map(buildCharView)
    .sort((a, b) => b.level - a.level || (b.rarity - a.rarity) || a.name.localeCompare(b.name, 'zh'))
    .slice(0, MAX_BUILD_CHARS)

  return {
    ok: true,
    player,
    chars,
    total: raw.length,
    truncated: raw.length > MAX_BUILD_CHARS,
    avatarStat
  }
}

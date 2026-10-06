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
 *
 * 支持只看指定角色（`#DPS练度查询 胡桃`）：名字/别名经角色表解析成 avatarId 后再过滤，
 * 因此「胡桃」「桃」「胡堂主」都能命中，未命中的关键词原样回传给调用方提示用户。
 */
import { fetchPlayer, readPlayer } from '../model/EnkaClient.js'
import { characterById, elementCn, findCharacter } from '../model/CharacterIndex.js'
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

/** 武器面板属性名（Enka flat.weaponStats 的 appendPropId）→ 中文 */
export function weaponStatLabel (prop) {
  if (String(prop) === 'FIGHT_PROP_BASE_ATTACK') return '基础攻击'
  return propLabel(prop)
}

/**
 * 武器面板数值文本
 * 与圣遗物词条同口径：Enka 的武器副词条已经是 0~1 小数（如 0.662 = 66.2%）
 */
export function weaponStatText (prop, value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  return isPercentProp(prop) ? `${(n * 100).toFixed(1)}%` : numText(Math.round(n))
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
 *
 * 只给文本回退与状态展示用：面板图由 miao-plugin 自己按 itemId 解析武器（含名字/图标/文案），
 * 这里读到的 `flat.name` 在站点数据缺名字时可能为空，故仅作展示字段。
 * @param {object} avatar - Enka avatarInfo
 * @returns {{name: string, level: number, refine: number, rarity: number, attrs: Array}|null}
 */
export function readWeapon (avatar) {
  const item = (avatar?.equipList || []).find(i => i?.flat?.itemType === 'ITEM_WEAPON')
  if (!item) return null
  const affix = item.weapon?.affixMap ? Number(Object.values(item.weapon.affixMap)[0]) : 0
  const refine = Number.isFinite(affix) ? affix + 1 : 1
  // Enka 的 flat.weaponStats 就是武器面板（基础攻击 + 一条副词条），照原样展示
  const attrs = (item.flat.weaponStats || []).map(s => ({
    label: weaponStatLabel(s.appendPropId),
    value: weaponStatText(s.appendPropId, s.statValue)
  }))
  return {
    name: String(item.flat.name || ''),
    level: Number(item.weapon?.level) || 0,
    // Enka 的精炼等级是 0 基（0 = 精一）
    refine,
    rarity: Number(item.flat.rankLevel) || 5,
    attrs
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
 * 单个角色 → 视图数据（文本回退与状态展示用）
 *
 * 面板**出图**不再用这些字段：练度面板整页由 miao-plugin 的模板渲染（见 model/MiaoBridge.js），
 * 名字/图标/评分都由 miao 按 itemId 现算，这里的 `weapon.name` 在站点数据缺名字时可能是空的。
 * @param {object} avatar - Enka avatarInfo
 * @returns {object}
 */
export function buildCharView (avatar) {
  const id = String(avatar?.avatarId ?? '')
  const record = characterById(avatar?.avatarId)
  const talents = readTalents(avatar?.skillLevelMap)
  const weapon = readWeapon(avatar)
  const artifacts = readArtifacts(avatar)
  const constellation = Array.isArray(avatar?.talentIdList) ? avatar.talentIdList.length : 0
  const name = record?.name || `#${id}`

  return {
    avatarId: id,
    name,
    avatar: id && hasAvatar(id) ? id : '',
    rarity: record?.rarity || 5,
    element: record?.element || '',
    elementCn: elementCn(record?.element),
    level: Number(avatar?.propMap?.['4001']?.ival) || 0,
    constellation,
    talents: talents.list,
    talentText: talents.text,
    weapon,
    stats: readPanel(avatar?.fightPropMap),
    artifacts
  }
}

/**
 * 按角色名/别名筛选 Enka 的 avatarInfoList（纯函数，便于离线回归）
 *
 * 名字先经角色表解析成 character_id，再用 `avatarInfoList[].avatarId` 匹配，
 * 因此别名（「桃」「胡堂主」）与正式名同等有效。
 *
 * 边界：**关键词全都不是角色名时不做筛选**（原样返回全部）。
 * 打错字时给整号面板 + 一行「未识别的参数」，比回一张空图有用；
 * 「命中角色名但该号没有这个角色」才是真正的筛选落空，由调用方提示。
 * @param {object[]} raw - Enka avatarInfoList
 * @param {string[]} names - 关键词
 * @returns {{ picked: object[], unknown: string[], matched: object[] }}
 */
export function pickAvatarsByNames (raw, names = []) {
  const keywords = (names || []).map(n => String(n).trim()).filter(Boolean)
  const unknown = keywords.filter(k => !findCharacter(k))
  const matched = keywords.map(k => findCharacter(k)).filter(Boolean)
  if (!matched.length) return { picked: raw, unknown, matched }

  const idSet = new Set(matched.map(r => String(r.character_id)))
  return {
    picked: (raw || []).filter(a => idSet.has(String(a?.avatarId ?? ''))),
    unknown,
    matched
  }
}

/**
 * 查询练度
 * @param {string} uid - 9 位 UID
 * @param {object} [opts] - { proxy, timeoutMs, downloadAvatars, names, fetch }
 * @param {string[]} [opts.names] - 只看这些角色（名字或别名；空数组 = 全部）
 * @param {Function} [opts.fetch] - 取数实现，默认 EnkaClient.fetchPlayer（回归套件注入离线样例）
 * @returns {Promise<object>}
 * @throws {Error} UID 非法 / Enka 侧错误（由 apps 层捕获后回复文本）
 */
export async function queryBuild (uid, opts = {}) {
  // `opts.fetch` 只给回归套件用：注入离线样例就能把「取数 → 筛选 → 组装」整条路跑通
  const fetcher = typeof opts.fetch === 'function' ? opts.fetch : fetchPlayer
  const data = await fetcher(uid, opts)
  const player = readPlayer(data)
  const raw = Array.isArray(data?.avatarInfoList) ? data.avatarInfoList : []

  const keywords = (opts.names || []).map(n => String(n).trim()).filter(Boolean)
  const { picked, unknown, matched } = pickAvatarsByNames(raw, keywords)

  // 先补齐立绘再组装视图：buildCharView 依赖本地是否已有立绘决定 avatar 字段
  const avatarIds = picked.map(a => String(a?.avatarId ?? '')).filter(Boolean)
  const wantAvatar = opts.downloadAvatars !== false && getPluginConfig()?.avatarEnabled !== false
  let avatarStat = { total: avatarIds.length, cached: avatarIds.filter(hasAvatar).length, downloaded: 0, failed: 0 }
  if (wantAvatar && avatarIds.length) {
    avatarStat = await ensureAvatars(avatarIds, opts)
  }

  const all = picked
    .map(buildCharView)
    .sort((a, b) => b.level - a.level || (b.rarity - a.rarity) || a.name.localeCompare(b.name, 'zh'))

  // 公开角色名单（筛选落空时用它告诉用户该号都有谁）
  const roster = raw
    .map(a => characterById(a?.avatarId)?.name || (a?.avatarId ? `#${a.avatarId}` : ''))
    .filter(Boolean)

  // 面板出图要的是**原始** avatarInfo：miao 的解析器直接吃 Enka 结构（见 model/MiaoBridge.js）
  const rawByAvatarId = {}
  for (const item of picked) {
    const id = String(item?.avatarId ?? '')
    if (id) rawByAvatarId[id] = item
  }

  return {
    ok: true,
    player,
    chars: all.slice(0, MAX_BUILD_CHARS),
    total: raw.length,
    matched: all.length,
    // 只有「确实解析出角色并筛过」才算筛选；关键词全是错别字时照常出全部，只额外回传 unknown
    filtered: matched.length > 0,
    unknown,
    roster,
    truncated: all.length > MAX_BUILD_CHARS,
    avatarStat,
    rawByAvatarId
  }
}

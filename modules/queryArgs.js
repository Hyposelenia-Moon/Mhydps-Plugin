/**
 * queryArgs — 命令参数解析
 *
 * 两种写法都支持，方便群友随手打：
 *   显式键值：`#DPS榜 角色:胡桃 金:12 标签:宏 页:2 绿玩 主C`
 *   位置简写：`#DPS榜 胡桃 12金 宏 -p2`
 * 解析只做语法层的事（哪个 token 是什么），角色名/首领名的合法性由 modules 里的查询函数校验。
 */
import { findBoss, findCharacter } from '../model/CharacterIndex.js'

/** 页码：第2页 / 2页 / p2 / -p2 */
const PAGE_RE = /^(?:第)?(\d+)页$|^[pP](\d+)$|^-p(\d+)$/
/** 金数上限：金≤12 / ≤12 / 金12 / 12金 */
const COST_MAX_RE = /^(?:金|成本)?\s*[≤<=]\s*(\d+)$|^(?:金|成本)(\d+)$|^(\d+)金$/
/** 金数下限：金≥8 / ≥8 */
const COST_MIN_RE = /^(?:金|成本)?\s*[≥>=]\s*(\d+)$/
/** 金数区间：8-12金 / 金8-12 */
const COST_RANGE_RE = /^(?:金|成本)?(\d+)\s*[-~到]\s*(\d+)\s*金?$/
/** 显式键值 */
const KV_RE = /^(角色|名称|name|金|成本|cost|标签|tag|页|page|版本|ver|首领|boss)[:：](.+)$/i

/** 取三个分组里第一个有值的数字 */
function pickNum (m, ...groups) {
  for (const g of groups) {
    if (m[g] !== undefined) return Number(m[g])
  }
  return NaN
}

/** 解析通用 token（页码 / 金数 / 绿玩 / 主C），命中返回结果对象，未命中返回 null */
function parseCommon (token) {
  let m
  if ((m = token.match(PAGE_RE))) {
    const page = Number(m[1] ?? m[2] ?? m[3])
    return Number.isFinite(page) ? { page } : null
  }
  if ((m = token.match(COST_RANGE_RE))) {
    return { costMin: Number(m[1]), costMax: Number(m[2]) }
  }
  if ((m = token.match(COST_MAX_RE))) {
    return { costMax: pickNum(m, 1, 2, 3) }
  }
  if ((m = token.match(COST_MIN_RE))) {
    return { costMin: Number(m[1]) }
  }
  if (/^(绿玩|纯净)$/.test(token)) return { cleanOnly: true }
  if (/^(主C|主c|主C位|只搜主C)$/.test(token)) return { mainOnly: true }
  return null
}

/** 归一化 token：全角冒号/空格、大小写 */
function tokenize (text) {
  return String(text || '')
    .replace(/：/g, ':')
    .split(/[\s,，]+/)
    .map(t => t.trim())
    .filter(Boolean)
}

/**
 * 解析 DPS 榜参数
 * @param {string} text - 去掉命令前缀后的参数部分
 * @returns {{ char: string, costMin: number|null, costMax: number|null, tag: string, cleanOnly: boolean, mainOnly: boolean, page: number, unknown: string[] }}
 */
export function parseRankArgs (text) {
  const args = {
    char: '',
    costMin: null,
    costMax: null,
    tag: '',
    cleanOnly: false,
    mainOnly: false,
    page: 1,
    unknown: []
  }

  for (const token of tokenize(text)) {
    const kv = token.match(KV_RE)
    if (kv) {
      const key = kv[1].toLowerCase()
      const value = kv[2].trim()
      if (['角色', '名称', 'name'].includes(key)) args.char = value
      else if (['金', '成本', 'cost'].includes(key)) args.costMax = Number(value.replace(/[^\d]/g, '')) || null
      else if (['标签', 'tag'].includes(key)) args.tag = value
      else if (['页', 'page'].includes(key)) args.page = Number(value.replace(/[^\d]/g, '')) || 1
      continue
    }

    const common = parseCommon(token)
    if (common) {
      Object.assign(args, common)
      continue
    }

    // 剩余 token：第一个当角色名，其余当标签（标签里常含点号/字母，如 总伤杯S3.N）
    if (!args.char && findCharacter(token)) args.char = token
    else if (!args.char) args.unknown.push(token)
    else args.tag = args.tag ? `${args.tag} ${token}` : token
  }

  return args
}

/**
 * 解析危战榜参数（多出 版本 / 首领 两个维度）
 * @param {string} text
 * @returns {{ char: string, ver: string, boss: string, costMin: number|null, costMax: number|null, page: number, unknown: string[] }}
 */
export function parseRaidArgs (text) {
  const args = {
    char: '',
    ver: '',
    boss: '',
    costMin: null,
    costMax: null,
    page: 1,
    unknown: []
  }

  for (const token of tokenize(text)) {
    const kv = token.match(KV_RE)
    if (kv) {
      const key = kv[1].toLowerCase()
      const value = kv[2].trim()
      if (['角色', '名称', 'name'].includes(key)) args.char = value
      else if (['版本', 'ver'].includes(key)) args.ver = value
      else if (['首领', 'boss'].includes(key)) args.boss = value
      else if (['金', '成本', 'cost'].includes(key)) args.costMax = Number(value.replace(/[^\d]/g, '')) || null
      else if (['页', 'page'].includes(key)) args.page = Number(value.replace(/[^\d]/g, '')) || 1
      continue
    }

    const common = parseCommon(token)
    if (common) {
      Object.assign(args, common)
      continue
    }

    // 版本号形如 7.1
    if (!args.ver && /^\d+\.\d+$/.test(token)) {
      args.ver = token
      continue
    }
    if (!args.boss && findBoss(token)) {
      args.boss = token
      continue
    }
    if (!args.char && findCharacter(token)) {
      args.char = token
      continue
    }
    args.unknown.push(token)
  }

  return args
}

export { parseCommon }

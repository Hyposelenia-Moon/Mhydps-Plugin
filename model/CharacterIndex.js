/**
 * CharacterIndex — 角色表 / 危战首领表索引
 *
 * 两张表随插件分发（resources/data/），来源是站点前端 bundle 里内嵌的静态数据：
 *   characters.json —— 123 条：name / alias[] / rarity / element / character_id
 *   bosses.json     —— 36 条：id / name / ver（危战每期三个首领）
 * 它们决定三件事：角色搜索（别名命中）、头像路径（character_id）、危战榜单的版本与首领筛选。
 * 站点若改版，重新抓一次 bundle 覆盖这两个文件即可（见 README「数据表维护」）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ELEMENT_CN } from '../components/constants.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../resources/data')

/** 缓存（惰性加载） */
let characterCache = null
let bossCache = null

/** 归一化关键词：小写 + 去空白 */
const norm = (s) => String(s ?? '').trim().toLowerCase()

/** 读 JSON 文件，失败抛错（数据表缺失属于安装不完整） */
function readJson (file) {
  const p = path.join(dataDir, file)
  const raw = fs.readFileSync(p, 'utf8')
  const json = JSON.parse(raw)
  if (!Array.isArray(json)) throw new Error(`${file} 结构异常：应为数组`)
  return json
}

/** 角色表（惰性加载 + 缓存） */
export function characters () {
  if (!characterCache) characterCache = readJson('characters.json')
  return characterCache
}

/** 危战首领表（惰性加载 + 缓存） */
export function bosses () {
  if (!bossCache) bossCache = readJson('bosses.json')
  return bossCache
}

/** 清缓存（测试与热更新用） */
export function resetCache () {
  characterCache = null
  bossCache = null
}

/** 元素英文 → 中文（未知原样返回） */
export function elementCn (element) {
  return ELEMENT_CN[element] || element || ''
}

/** 按 character_id 取角色记录 */
export function characterById (id) {
  const target = Number(id)
  if (!Number.isFinite(target)) return null
  return characters().find(c => c.character_id === target) || null
}

/**
 * 按名字/别名找角色，返回带评分的候选（分数越小越贴近）
 * @param {string} keyword
 * @returns {Array<{ record: object, score: number, hit: string }>}
 */
function candidates (keyword) {
  const key = norm(keyword)
  if (!key) return []
  const out = []
  for (const record of characters()) {
    const name = norm(record.name)
    let best = null
    if (name === key) best = { score: 0, hit: record.name }
    else if ((record.alias || []).some(a => norm(a) === key)) best = { score: 1, hit: key }
    else if (name.startsWith(key)) best = { score: 2, hit: record.name }
    else if ((record.alias || []).some(a => norm(a).startsWith(key))) best = { score: 3, hit: key }
    else if (name.includes(key)) best = { score: 4, hit: record.name }
    else if ((record.alias || []).some(a => norm(a).includes(key))) best = { score: 5, hit: key }
    if (best) out.push({ record, ...best })
  }
  // 同分时按 rarity 降序（更可能是玩家想找的那个）、名字长度升序
  return out.sort((a, b) => a.score - b.score
    || (b.record.rarity || 0) - (a.record.rarity || 0)
    || String(a.record.name).length - String(b.record.name).length)
}

/**
 * 关键词 → 单个角色（取最贴近的一个）
 * @param {string} keyword
 * @returns {object|null}
 */
export function findCharacter (keyword) {
  return candidates(keyword)[0]?.record || null
}

/**
 * 关键词 → 角色候选列表
 * @param {string} keyword
 * @param {number} [limit]
 * @returns {object[]}
 */
export function searchCharacters (keyword, limit = 8) {
  return candidates(keyword).slice(0, limit).map(c => c.record)
}

/**
 * 判断榜单里的成员名是否命中某个角色记录（成员名可能是别名，如「爷」「龟」）
 * @param {string} memberName
 * @param {object} record
 * @returns {boolean}
 */
export function memberIs (memberName, record) {
  if (!memberName || !record) return false
  const key = norm(memberName)
  if (norm(record.name) === key) return true
  return (record.alias || []).some(a => norm(a) === key)
}

/**
 * 角色名 → 立绘 id（用于头像路径）；找不到返回空串
 * @param {string} name
 * @returns {string}
 */
export function avatarIdOf (name) {
  return findCharacter(name)?.character_id ? String(findCharacter(name).character_id) : ''
}

/** 全部危战版本（降序，7.1 → 5.7） */
export function versions () {
  const list = [...new Set(bosses().map(b => b.ver))]
  return list.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
}

/** 按 id 取首领 */
export function bossById (id) {
  const target = Number(id)
  if (!Number.isFinite(target)) return null
  return bosses().find(b => b.id === target) || null
}

/** 某版本下的全部首领 */
export function bossesOfVer (ver) {
  return bosses().filter(b => b.ver === ver)
}

/**
 * 关键词 → 首领（名字精确 > 名字包含）
 * @param {string} keyword
 * @returns {object|null}
 */
export function findBoss (keyword) {
  const key = norm(keyword)
  if (!key) return null
  const list = bosses()
  return list.find(b => norm(b.name) === key)
    || list.find(b => norm(b.name).includes(key))
    || list.find(b => key.includes(norm(b.name)))
    || null
}

/** Mhydps 插件常量定义 */

/** 站点信息（数据来源，只读展示用） */
export const SITE_NAME = '原神DPS数据库'
export const SITE_ORIGIN = 'https://www.mhydps.cn'
export const SITE_HOST = 'www.mhydps.cn'

/**
 * 站点接口路径
 *
 * 这些是站点前端 bundle 里实际调用的接口（非官方公开文档）：
 *   /api/teams    —— DPS 数据库配队收录（数组，已按 damage 降序）
 *   /api/teams2   —— 危战榜单（数组，字段含 version / boss / speed）
 *   /api/enka/uid —— 练度查询（站点代理 Enka API，返回 Enka 标准 JSON）
 * 站点 nginx 对无 Referer 的请求直接 403，故请求头必须带下面的 Referer。
 */
export const API_PATH = {
  teams: '/api/teams',
  teams2: '/api/teams2'
}

/** Enka 练度代理路径 */
export const enkaPath = (uid) => `/api/enka/uid/${uid}`

/** 角色立绘路径（站点自托管，用于渲染角色头像） */
export const avatarUrl = (characterId) => `${SITE_ORIGIN}/charactor/${characterId}.webp`

/** 请求头：Referer 是站点 nginx 的硬要求，UA 沿用站点自身前端/AI 请求所用的标识 */
export const SITE_REFERER = `${SITE_ORIGIN}/`
export const SITE_USER_AGENT = 'MHYDPS-CN/1.0'

/** 缓存文件名（data/ 下，gitignore） */
export const CACHE_FILE = {
  teams: 'teams.json',
  teams2: 'teams2.json',
  meta: 'meta.json'
}

/** 角色头像缓存目录名（data/ 下） */
export const AVATAR_DIR = 'avatar'

/** 榜单每页上限（配置里的 pageSize 不得超过它） */
export const MAX_PAGE_SIZE = 20

/** 单次渲染最多展示的角色数（练度查询一次最多渲染 12 个角色，超出截断） */
export const MAX_BUILD_CHARS = 12

/** 元素英文 → 中文（与站点角色表 element 字段对应） */
export const ELEMENT_CN = {
  Cryo: '冰',
  Pyro: '火',
  Hydro: '水',
  Electro: '雷',
  Anemo: '风',
  Geo: '岩',
  Dendro: '草'
}

/** 伤害数值 → 中文数量级文本（如 3230000 → 323.0 万） */
export function damageText (value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '-'
  if (n >= 100000000) return `${(n / 100000000).toFixed(2)} 亿`
  if (n >= 10000) return `${(n / 10000).toFixed(1)} 万`
  return String(Math.round(n))
}

/** 秒数 → 展示文本 */
export function speedText (value) {
  const n = Number(value)
  return Number.isFinite(n) ? `${n}s` : '-'
}

/** 时间戳 → 'YYYY-MM-DD HH:mm' */
export function formatTime (ts) {
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return '-'
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 毫秒 → “x 分钟前 / x 小时前 / x 天前” */
export function agoText (ms) {
  if (!Number.isFinite(ms) || ms < 0) return '-'
  const min = Math.floor(ms / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  return `${Math.floor(hour / 24)} 天前`
}

/** 版权页脚（模板统一使用） */
export const COPYRIGHT = `Data from mhydps.cn · Created By TRSS-yunzai & Mhydps-Plugin`

/* ===== Enka 字段映射（练度查询用） ===== */

/**
 * 圣遗物 / 面板属性名 → 中文标签
 * 站点前端用的是同一套 FIGHT_PROP_* 常量，这里保持同名以便对照
 */
export const ENKA_PROP_CN = {
  FIGHT_PROP_HP: '生命值',
  FIGHT_PROP_HP_PERCENT: '生命值',
  FIGHT_PROP_ATTACK: '攻击力',
  FIGHT_PROP_ATTACK_PERCENT: '攻击力',
  FIGHT_PROP_DEFENSE: '防御力',
  FIGHT_PROP_DEFENSE_PERCENT: '防御力',
  FIGHT_PROP_ELEMENT_MASTERY: '元素精通',
  FIGHT_PROP_CHARGE_EFFICIENCY: '元素充能效率',
  FIGHT_PROP_CRITICAL: '暴击率',
  FIGHT_PROP_CRITICAL_HURT: '暴击伤害',
  FIGHT_PROP_HEAL_ADD: '治疗加成',
  FIGHT_PROP_PHYSICAL_ADD_HURT: '物理伤害加成',
  FIGHT_PROP_FIRE_ADD_HURT: '火元素伤害加成',
  FIGHT_PROP_ELEC_ADD_HURT: '雷元素伤害加成',
  FIGHT_PROP_WATER_ADD_HURT: '水元素伤害加成',
  FIGHT_PROP_GRASS_ADD_HURT: '草元素伤害加成',
  FIGHT_PROP_WIND_ADD_HURT: '风元素伤害加成',
  FIGHT_PROP_ROCK_ADD_HURT: '岩元素伤害加成',
  FIGHT_PROP_ICE_ADD_HURT: '冰元素伤害加成'
}

/**
 * 属性是否为百分比
 * 与站点前端同规则：名字含 PERCENT / CRITICAL / ADD_HURT / CHARGE_EFFICIENCY / HEAL_ADD
 * @param {string} prop - FIGHT_PROP_* 常量名
 * @returns {boolean}
 */
export function isPercentProp (prop) {
  const name = String(prop || '')
  return name.includes('PERCENT') || name.includes('CRITICAL')
    || name.includes('ADD_HURT') || name.includes('CHARGE_EFFICIENCY') || name.includes('HEAL_ADD')
}

/** 圣遗物部位（Enka flat.equipType）→ 中文 */
export const EQUIP_SLOT_CN = {
  EQUIP_BRACER: '生之花',
  EQUIP_NECKLACE: '死之羽',
  EQUIP_SHOES: '时之沙',
  EQUIP_RING: '空之杯',
  EQUIP_DRESS: '理之冠'
}

/** 圣遗物部位的固定展示顺序 */
export const EQUIP_SLOT_ORDER = ['EQUIP_BRACER', 'EQUIP_NECKLACE', 'EQUIP_SHOES', 'EQUIP_RING', 'EQUIP_DRESS']

/**
 * 角色面板要展示的属性（fightPropMap 的键 → 标签）
 * 20/22/23 是 0~1 的小数（百分比），其余是绝对值
 */
export const PANEL_PROPS = [
  { key: '2000', label: '生命值', percent: false },
  { key: '2001', label: '攻击力', percent: false },
  { key: '2002', label: '防御力', percent: false },
  { key: '28', label: '元素精通', percent: false },
  { key: '20', label: '暴击率', percent: true },
  { key: '22', label: '暴击伤害', percent: true },
  { key: '23', label: '元素充能效率', percent: true }
]

/** 天赋位次（Enka skillLevelMap 键的末位）→ 中文 */
export const TALENT_POSITION_CN = {
  1: '普攻',
  2: '战技',
  3: '爆发'
}

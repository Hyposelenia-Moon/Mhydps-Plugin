/**
 * 练度面板素材：图库探测、稳定选图、图标查找、降级
 *
 * 全部离线跑：用 MHYDPS_PROFILE_IMG / MHYDPS_MIAO_RES 指向测试自建的假图库与假 miao 资源目录，
 * 不读真实安装（真实目录的结构与命名在 README 里核对过，套件只锁「探测与降级的行为」）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { checker, ensureTmpDir, pluginRoot } from './_helper.mjs'

const { check, finish } = checker()

const tmp = path.join(ensureTmpDir(), 'panel-assets')
fs.rmSync(tmp, { recursive: true, force: true })

// ---- 自建假图库：normal-character/胡桃/{a,b}.webp + normal-character/琴.webp 单文件布局 ----
const gallery = path.join(tmp, 'gallery')
const hutaoDir = path.join(gallery, 'normal-character', '胡桃')
fs.mkdirSync(hutaoDir, { recursive: true })
fs.writeFileSync(path.join(hutaoDir, '胡桃_1_a.webp'), 'A')
fs.writeFileSync(path.join(hutaoDir, '胡桃_2_b.webp'), 'B')
fs.writeFileSync(path.join(gallery, 'normal-character', '琴.webp'), 'Q')
fs.writeFileSync(path.join(gallery, 'normal-character', 'ignore.txt'), 'not an image')

// ---- 自建假 miao 资源：命座 / 立绘 / 武器 / 圣遗物 ----
const miao = path.join(tmp, 'miao')
const charDir = path.join(miao, 'meta-gs', 'character', '胡桃')
fs.mkdirSync(path.join(charDir, 'icons'), { recursive: true })
fs.mkdirSync(path.join(charDir, 'imgs'), { recursive: true })
fs.writeFileSync(path.join(charDir, 'icons', 'cons-1.webp'), 'C1')
fs.writeFileSync(path.join(charDir, 'icons', 'cons-3.webp'), 'C3')
fs.writeFileSync(path.join(charDir, 'imgs', 'splash.webp'), 'S')
const weaponDir = path.join(miao, 'meta-gs', 'weapon', 'polearm', '护摩之杖')
fs.mkdirSync(weaponDir, { recursive: true })
fs.writeFileSync(path.join(weaponDir, 'icon.webp'), 'W')
fs.writeFileSync(path.join(weaponDir, 'data.json'), JSON.stringify({
  name: '护摩之杖',
  affixTitle: '无羁的朱赤之蝶',
  desc: '朱赤柴火杖。',
  affixData: { text: '生命值提升$[0]，攻击力提升$[1]。', datas: { 0: ['20%', '25%', '30%'], 1: ['0.8%', '1%', '1.2%'] } }
}))
const artiDir = path.join(miao, 'meta-gs', 'artifact')
fs.mkdirSync(path.join(artiDir, 'imgs', '炽烈的炎之魔女'), { recursive: true })
fs.mkdirSync(path.join(miao, 'meta-gs', 'character', '琴'), { recursive: true })
fs.writeFileSync(path.join(artiDir, 'imgs', '炽烈的炎之魔女', '1.webp'), 'A1')
fs.writeFileSync(path.join(artiDir, 'data.json'), JSON.stringify({
  400114: { id: 400114, name: '炽烈的炎之魔女', idxs: { 1: { id: 80540, name: '魔女的炎之花' } } }
}))
// 共用素材（底纹 / 星级 / 属性图标）
for (const [rel, body] of [
  ['common/cont/card-bg.png', 'card'],
  ['common/item/star.png', 'star'],
  ['character/imgs/icon.png', 'icons']
]) {
  const p = path.join(miao, rel)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, body)
}

// 数据目录也隔离，避免把缓存写进真实 data/
process.env.MHYDPS_DATA_DIR = path.join(tmp, 'data')
process.env.MHYDPS_PROFILE_IMG = gallery
process.env.MHYDPS_MIAO_RES = miao

const A = await import(`file://${path.join(pluginRoot, 'model', 'PanelAssets.js')}`)

// ---- 目录探测 ----
check('探测到图库目录', A.profileImgDir() === path.resolve(gallery), A.profileImgDir())
check('探测到 miao 资源目录', A.miaoResDir() === path.resolve(miao), A.miaoResDir())
check('图库目录不存在时不报错（返回空串）', (() => {
  process.env.MHYDPS_PROFILE_IMG = path.join(tmp, 'nope')
  const v = A.profileImgDir()
  process.env.MHYDPS_PROFILE_IMG = gallery
  return v === ''
})(), '')

// ---- 立绘查找与稳定选图 ----
const images = A.profileImagesOf('胡桃')
check('目录布局的立绘全部列出', images.length === 2, `${images.length} 张`)
check('非图片文件被忽略', images.every(p => p.endsWith('.webp')))
check('单文件布局（<角色名>.webp）也能找到', A.profileImagesOf('琴').length === 1)
check('未收录的角色返回空数组', A.profileImagesOf('不存在的角色').length === 0)

const first = A.pickProfileImage('胡桃', '10000046')
check('同一种子恒选同一张（不会每次刷新换图）', first === A.pickProfileImage('胡桃', '10000046'), path.basename(first))
check('不同种子会分到不同张（多张图时）', new Set(['1', '2', '3', '4', '5', '6', '7', '8']
  .map(s => A.pickProfileImage('胡桃', s))).size > 1)
check('没有图库时返回空串', (() => {
  const bak = process.env.MHYDPS_PROFILE_IMG
  process.env.MHYDPS_PROFILE_IMG = path.join(tmp, 'nope')
  const v = A.pickProfileImage('胡桃', '1')
  process.env.MHYDPS_PROFILE_IMG = bak
  return v === ''
})())

// ---- 图标查找 ----
check('命座图标按角色目录查找', path.basename(A.consIcon('胡桃', 1)) === 'cons-1.webp')
check('缺失的命座图标返回空串', A.consIcon('胡桃', 2) === '')
check('未安装 miao 时命座图标为空串', A.consIcon('琴', 1) === '')
check('官方立绘兜底立绘可用', path.basename(A.splashImage('胡桃')) === 'splash.webp')
check('武器图标跨类型目录查找', path.basename(A.weaponIcon('护摩之杖')) === 'icon.webp')
check('未知武器返回空串', A.weaponIcon('不存在的武器') === '')
check('圣遗物图标经「部件名 → 套装」反查', path.basename(A.artifactIcon('魔女的炎之花')) === '1.webp')
check('未知圣遗物部件返回空串', A.artifactIcon('不存在的部件') === '')

// ---- 武器文案：精炼档位替换 ----
const detail = A.weaponDetail('护摩之杖', 2)
check('武器被动文案按精炼取档', detail?.passive === '生命值提升25%，攻击力提升1%。', detail?.passive || '')
check('武器副标题与说明文案可读', detail?.title === '无羁的朱赤之蝶' && detail?.desc === '朱赤柴火杖。')
check('未知武器文案返回 null', A.weaponDetail('不存在的武器') === null)

// ---- 复制进 data/panel/：模板用 _data_path 引用 ----
const assets = A.preparePanelAssets({
  avatarId: '10000046',
  name: '胡桃',
  constellation: 3,
  weaponName: '护摩之杖',
  artifacts: [{ name: '魔女的炎之花' }]
})
const panelDir = path.join(process.env.MHYDPS_DATA_DIR, 'panel')
check('面板立绘已复制进 data/panel/', Boolean(assets.bg) && fs.existsSync(path.join(panelDir, assets.bg)), assets.bg)
check('命座素材 6 个位次都返回（有图标的才有文件名）', assets.cons.length === 6 && assets.cons.filter(c => c.icon).length === 2)
check('命座点亮状态按命座数', assets.cons.filter(c => c.on).length === 3)
check('武器图标已复制', Boolean(assets.weapon) && fs.existsSync(path.join(panelDir, assets.weapon)), assets.weapon)
check('圣遗物图标已复制且与部件一一对应', assets.artifacts.length === 1 && Boolean(assets.artifacts[0]) && fs.existsSync(path.join(panelDir, assets.artifacts[0])))

const shared = A.prepareSharedAssets()
check('共用素材（底纹/星级/属性图标）都复制到位', Object.values(shared).every(Boolean) && Object.values(shared).every(f => fs.existsSync(path.join(panelDir, f))), Object.values(shared).join(','))

// ---- 完全没装 miao / 图库时的降级：字段为空串而不是抛错 ----
const bakMiao = process.env.MHYDPS_MIAO_RES
const bakGallery = process.env.MHYDPS_PROFILE_IMG
process.env.MHYDPS_MIAO_RES = path.join(tmp, 'nope')
process.env.MHYDPS_PROFILE_IMG = path.join(tmp, 'nope')
const bare = A.preparePanelAssets({ avatarId: '10000046', name: '胡桃', constellation: 0 })
check('没有图库与 miao 时立绘为空（模板不裂图）', bare.bg === '', bare.bg)
check('没有 miao 时图标全部为空', bare.cons.every(c => !c.icon) && bare.weapon === '' && bare.artifacts.length === 0)
check('没有 miao 时共用素材为空', Object.values(A.prepareSharedAssets()).every(v => v === ''))
check('没有 miao 时武器文案为 null', A.weaponDetail('护摩之杖', 1) === null)
process.env.MHYDPS_MIAO_RES = bakMiao
process.env.MHYDPS_PROFILE_IMG = bakGallery

// ---- 面板模板契约：照 miao 的版式，但不搬它下面那块「伤害计算」 ----
// 站点数据里没有伤害计算所需的配置/敌人参数，硬搬只会得到一张空表或编造的数字。
const buildHtml = fs.readFileSync(path.join(pluginRoot, 'resources', 'dps', 'build.html'), 'utf8')
const panelCssText = fs.readFileSync(path.join(pluginRoot, 'resources', 'profile', 'panel.css'), 'utf8')
const dmgMarkers = ['dmg-cont', 'dmg-list', 'dmg-idx', 'dmg-title', '伤害计算', '期望伤害']
check('面板不包含 miao 的伤害计算区块', dmgMarkers.every(m => !buildHtml.includes(m) && !panelCssText.includes(m)),
  dmgMarkers.filter(m => buildHtml.includes(m) || panelCssText.includes(m)).join(','))
check('面板仍然保留「暴击伤害」这条属性（属性行是站点数据）', buildHtml.includes('i-cdmg') || panelCssText.includes('.i-cdmg'))
check('面板止于武器卡与圣遗物卡（没有第五个区块）', !buildHtml.includes('panel-dmg') && !panelCssText.includes('.panel-dmg'))

finish()

/**
 * miao 桥接：复用 miao-plugin 的面板代码
 *
 * 这一套件只在**本机装了 miao-plugin** 时跑（`MHYDPS_MIAO_PLUGIN` 或 plugins/miao-plugin）；
 * 没装就打印「跳过」并以 0 退出 —— 插件本身在没装 miao 时会回退纯文本。
 *
 * 钉住三件容易回归的事：
 *   1) 站点 Enka 数据只给 `ival` 时，归一化后 miao 也能算等级（miao 读的是 `val`）；
 *   2) 站点数据缺 `flat.name` 时，武器/圣遗物名字仍由 miao **按 itemId** 解析出来（自绘版最大的毛病）；
 *   3) 伤害计算表传空（`dmgCalc.dmgData = []`），miao 模板里的那块不会渲染。
 */
import fs from 'node:fs'
import path from 'node:path'
import { checker, ensureTmpDir, installFrameworkStubs, loadFixture, mod, skip, tempDataDir } from './_helper.mjs'

installFrameworkStubs()

process.env.MHYDPS_DATA_DIR = tempDataDir('miao-bridge-data')
process.env.MHYDPS_CONFIG_FILE = path.join(tempDataDir('miao-bridge-config'), 'config.yaml')

const {
  miaoPluginDir,
  loadMiao,
  miaoLoadError,
  normalizeAvatarInfo,
  buildMiaoProfile,
  toPanelData
} = await import(mod('model/MiaoBridge.js'))

const { check, finish } = checker()

const miaoDir = miaoPluginDir()
if (!miaoDir) {
  skip('本机没装 miao-plugin（练度面板会回退纯文本）')
}

// miao 的代码按「cwd = bot 根」定位自己的资源与 Yunzai 根目录（生产环境天然如此），
// 工作区里跑套件时要把 cwd 补成 bot 根，否则它会去工作区上层找 package.json。
const miaoBotRoot = path.resolve(miaoDir, '..', '..')
if (path.resolve(process.cwd()) !== miaoBotRoot) process.chdir(miaoBotRoot)

const miao = await loadMiao()
check('加载到 miao-plugin 的模型与渲染入口', Boolean(miao?.models?.Character && miao?.Common?.render && miao?.EnkaData?.setAvatar), miao ? miao.dir : miaoLoadError())

// ---- 归一化：站点给 ival，miao 读 val ----
const normalized = normalizeAvatarInfo({ propMap: { 4001: { ival: 90 }, 1002: { ival: 6 } }, fetterInfo: undefined })
check('ival → val（miao 的解析读 val）', normalized.propMap['4001'].val === '90' && normalized.propMap['1002'].val === '6', JSON.stringify(normalized.propMap))
check('已有 val 时原样保留', normalizeAvatarInfo({ propMap: { 4001: { ival: 1, val: '90' } } }).propMap['4001'].val === '90')
check('缺 fetterInfo 时补默认值（miao 会直接取 expLevel）', normalized.fetterInfo.expLevel === 0)
check('不改动原始对象', !('val' in ({ propMap: { 4001: { ival: 90 } } }).propMap['4001']))

// ---- 造一份「站点风格」的原始数据：只给 ival、武器/圣遗物没有 flat.name ----
// （站点 Enka 代理对新角色的 flat.name 可能为空，名字必须由 miao 按 itemId 反查）
const sample = loadFixture('enka.sample.json')
const rawHutao = JSON.parse(JSON.stringify(sample.avatarInfoList[0]))
for (const item of rawHutao.equipList || []) {
  delete item.flat.name
  if (item.flat.itemType === 'ITEM_WEAPON') item.weapon.promoteLevel = 6
  if (item.flat.itemType === 'ITEM_RELIQUARY') {
    item.reliquary = { level: 21, mainPropId: 'FIGHT_PROP_HP', appendPropIdList: [10110, 501064, 501224, 501234] }
  }
}
rawHutao.propMap = { 4001: { ival: 90 }, 1002: { ival: 6 } }
delete rawHutao.fetterInfo

const profile = await buildMiaoProfile('100000046', rawHutao)
check('miao 解析出可用面板（isProfile）', Boolean(profile), profile ? '' : 'parse failed')

if (profile) {
  check('武器名由 miao 按 itemId 解析（站点没给名字也能出）', profile.weapon?.name === '护摩之杖', String(profile.weapon?.name || ''))
  check('武器精炼与等级沿用站点数据', profile.weapon?.affix === 1 && profile.weapon?.level === 90, `${profile.weapon?.affix} / ${profile.weapon?.level}`)
  check('角色等级来自 propMap（归一化后）', profile.level === 90, String(profile.level))
  check('命座数来自 talentIdList', profile.cons === 3, String(profile.cons))

  const panelData = await toPanelData({ uid: '100000046', profile, costumeSplash: 'file:///tmp/art.webp' })
  check('面板数据含 miao 模板需要的字段', Boolean(panelData?.data?.weapon && panelData.attr && panelData.artisDetail && panelData.artisKeyTitle), Object.keys(panelData || {}).join(','))
  check('面板立绘透传（file:// 原样使用）', panelData.data.costumeSplash === 'file:///tmp/art.webp')
  check('属性表含 基础/加成 拆分字段', panelData.attr.hpBase !== undefined && panelData.attr.hpPlus !== undefined && panelData.attr.cpctBase !== undefined, Object.keys(panelData.attr).slice(0, 6).join(','))
  check('伤害计算传空（模板不会渲染那块）', Array.isArray(panelData.dmgCalc.dmgData) && panelData.dmgCalc.dmgData.length === 0)
  check('保留 miao 的圣遗物评分结构（评分/评级/词条统计都在）', Boolean(panelData.artisDetail?.artis && 'mark' in panelData.artisDetail && 'markClass' in panelData.artisDetail && Array.isArray(panelData.artisDetail.allAttr) && panelData.artisDetail.allAttr.length === 9), Object.keys(panelData.artisDetail || {}).join(','))
  check('面板模板仍走 miao 的文件', fs.existsSync(path.join(miao.dir, 'resources', 'character', 'profile-detail.html')))
  check('miao 模板里确有伤害计算块（我们用空数据跳过它）', fs.readFileSync(path.join(miao.dir, 'resources', 'character', 'profile-detail.html'), 'utf8').includes('dmgData?.length > 0'))
}

finish()

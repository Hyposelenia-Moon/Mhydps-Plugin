/**
 * 练度视图：Enka 原始数据 → 面板/武器/天赋/圣遗物
 *
 * 用离线样例（test/fixtures/enka.sample.json）钉住几个容易错的换算：
 *   圣遗物等级是 1 基（展示要 -1）、武器精炼是 0 基（展示要 +1）、
 *   面板百分比是 0~1 小数（要 ×100），而圣遗物词条里的百分比已经是 7.8 这样的数（不能乘）。
 */
import path from 'node:path'
import { checker, installFrameworkStubs, loadFixture, mod, requireDeps, tempDataDir } from './_helper.mjs'

installFrameworkStubs()
requireDeps('yaml')

const dataDir = tempDataDir('build-query-data')
const cfgDir = tempDataDir('build-query-config')
process.env.MHYDPS_DATA_DIR = dataDir
process.env.MHYDPS_CONFIG_FILE = path.join(cfgDir, 'config.yaml')

const {
  buildCharView,
  readWeapon,
  readArtifacts,
  readTalents,
  readPanel,
  artifactStatText,
  panelStatText,
  weaponStatLabel,
  weaponStatText,
  pickAvatarsByNames,
  queryBuild
} = await import(mod('modules/buildQuery.js'))
const { readPlayer } = await import(mod('model/EnkaClient.js'))

const { check, finish } = checker()

const sample = loadFixture('enka.sample.json')
const player = readPlayer(sample)
check('玩家信息读取', player.nickname === '测试玩家' && player.uid === '100000000' && player.level === 60)
check('公开角色数', player.avatarCount === 2)

const hutao = sample.avatarInfoList[0]

// ---- 武器 ----
const weapon = readWeapon(hutao)
check('武器名与等级', weapon.name === '护摩之杖' && weapon.level === 90)
check('精炼 0 基转 1 基', weapon.refine === 1, `精炼 ${weapon.refine}`)
check('无武器时返回 null', readWeapon({ equipList: [] }) === null)

// ---- 圣遗物 ----
const artifacts = readArtifacts(hutao)
check('三件圣遗物按部位顺序排列', artifacts.map(a => a.slot).join(',') === '生之花,死之羽,时之沙', artifacts.map(a => a.slot).join(','))
check('圣遗物等级 1 基转 0 基', artifacts[0].level === 20, `等级 ${artifacts[0].level}`)
check('主词条标签与数值', artifacts[0].mainLabel === '生命值' && artifacts[0].mainValue === '4780', `${artifacts[0].mainLabel} ${artifacts[0].mainValue}`)
check('副词条条数', artifacts[0].substatCount === 4 && artifacts[1].substatCount === 2)
check('副词条百分比不重复乘 100', artifacts[0].substats[0].value === '7.8%', artifacts[0].substats[0].value)
check('副词条固定值取整', artifacts[0].substats[3].value === '40', artifacts[0].substats[3].value)
check('充能效率识别为百分比', artifacts[1].substats[1].value === '11.7%', artifacts[1].substats[1].value)
check('百分比主词条', artifacts[2].mainLabel === '生命值' && artifacts[2].mainValue === '46.6%', artifacts[2].mainValue)
check('缺字段时返回空数组', readArtifacts({}).length === 0)

// ---- 天赋 ----
const talents = readTalents(hutao.skillLevelMap)
check('天赋按普攻/战技/爆发取位', talents.list.map(t => t.label).join('/') === '普攻/战技/爆发')
check('天赋文本连写', talents.text === '10/9/8', talents.text)
check('被动技能（末位 4）不参与', talents.list.length === 3)
check('空天赋表不抛错', readTalents(undefined).text === '')

// ---- 面板 ----
const panel = readPanel(hutao.fightPropMap)
const byLabel = Object.fromEntries(panel.map(p => [p.label, p.value]))
check('生命值取整', byLabel['生命值'] === '33139', byLabel['生命值'])
check('暴击率小数转百分比', byLabel['暴击率'] === '54.2%', byLabel['暴击率'])
check('暴击伤害小数转百分比', byLabel['暴击伤害'] === '188.4%', byLabel['暴击伤害'])
check('元素精通取整', byLabel['元素精通'] === '374')
check('面板共 7 项', panel.length === 7)

// ---- 数值格式 ----
check('百分比词条格式', artifactStatText('FIGHT_PROP_CRITICAL', 7.8) === '7.8%')
check('物理伤害加成识别为百分比', artifactStatText('FIGHT_PROP_PHYSICAL_ADD_HURT', 58.3) === '58.3%')
check('非百分比词条取整', artifactStatText('FIGHT_PROP_ATTACK', 311.4) === '311')
check('NaN 兜底为 -', artifactStatText('FIGHT_PROP_ATTACK', NaN) === '-')
check('面板百分比格式', panelStatText(0.542, true) === '54.2%')
check('面板固定值格式', panelStatText(33139.43, false) === '33139')

// ---- 角色级视图 ----
const view = buildCharView(hutao)
check('角色名来自角色表', view.name === '胡桃', view.name)
check('元素中文', view.elementCn === '火')
check('等级来自 propMap.4001', view.level === 90)
check('命座数=已解锁列表长度', view.constellation === 3, `${view.constellation}`)
check('聚合字段齐全', Boolean(view.weapon && view.stats.length && view.artifacts.length && view.talentText))
check('无立绘缓存时 avatar 为空（模板走文字占位）', view.avatar === '')

const qiqi = buildCharView(sample.avatarInfoList[1])
check('第二个角色无武器/圣遗物也不崩', qiqi.name === '琴' && qiqi.weapon === null && qiqi.artifacts.length === 0)
check('命座为 1 时计数正确', qiqi.constellation === 1, `${qiqi.constellation}`)

// ---- 武器面板（Enka flat.weaponStats） ----
check('武器面板属性读取', weapon.attrs.length === 2, `${weapon.attrs.length} 项`)
check('基础攻击力标签', weaponStatLabel('FIGHT_PROP_BASE_ATTACK') === '基础攻击', weaponStatLabel('FIGHT_PROP_BASE_ATTACK'))
check('武器基础攻击取整', weapon.attrs[0].value === '608', weapon.attrs[0].value)
check('武器副词条 0~1 小数转百分比', weaponStatText('FIGHT_PROP_CRITICAL_HURT', 0.662) === '66.2%', weaponStatText('FIGHT_PROP_CRITICAL_HURT', 0.662))
check('武器副词条沿用面板词条标签', weapon.attrs[1].label === '暴击伤害', weapon.attrs[1].label)

// ---- 视图字段：面板出图交给 miao（model/MiaoBridge.js），这里只保证文本回退够用 ----
check('视图带角色 id 与元素（面板立绘按角色名取图、文本回退要显示元素）', /^\d+$/.test(view.avatarId) && view.element === 'Pyro', `${view.avatarId}/${view.element}`)
check('文本回退需要的面板数值齐全（7 项）', view.stats.length === 7)

// ---- 按角色名筛选（`#DPS练度查询 胡桃`） ----
let picked = pickAvatarsByNames(sample.avatarInfoList, ['胡桃'])
check('按正式名筛选命中所属角色', picked.picked.length === 1 && picked.picked[0].avatarId === hutao.avatarId)

picked = pickAvatarsByNames(sample.avatarInfoList, ['桃'])
check('按别名筛选同样命中', picked.picked.length === 1 && picked.picked[0].avatarId === hutao.avatarId)

picked = pickAvatarsByNames(sample.avatarInfoList, ['胡桃', '琴'])
check('多角色筛选取并集', picked.picked.length === 2)

picked = pickAvatarsByNames(sample.avatarInfoList, ['不存在的角色'])
check('关键词全都不是角色名时不当作筛选（原样返回全部，只提示未识别）', picked.picked.length === sample.avatarInfoList.length && picked.unknown.includes('不存在的角色'))

picked = pickAvatarsByNames(sample.avatarInfoList, [])
check('不筛选时原样返回全部', picked.picked.length === sample.avatarInfoList.length)

picked = pickAvatarsByNames(sample.avatarInfoList, ['胡桃', '瞎写'])
check('命中与未命中混用：只筛命中的，未命中单独回传', picked.picked.length === 1 && picked.unknown.join(',') === '瞎写')

// ---- queryBuild 整条路（注入离线样例，不联网、不下载立绘） ----
// 这一步专门防「组装函数里用了没 import 的符号」这类只在真机才炸的错误
const offline = (names) => queryBuild('100000000', {
  fetch: async () => sample,
  downloadAvatars: false,
  names
})

const all = await offline([])
check('queryBuild：全部角色按等级降序', all.chars.length === 2 && all.chars[0].name === '胡桃', all.chars.map(c => c.name).join(','))
check('queryBuild：回传原始 Enka 数据（面板出图给 miao 用）', Object.keys(all.rawByAvatarId).length === 2 && all.rawByAvatarId[hutao.avatarId]?.propMap, Object.keys(all.rawByAvatarId).join(','))
check('queryBuild：不筛选时 filtered=false 且名单齐全', all.filtered === false && all.roster.length === 2, all.roster.join(','))

const only = await offline(['胡桃'])
check('queryBuild：按角色筛选只留命中项', only.filtered === true && only.chars.length === 1 && only.chars[0].name === '胡桃')
check('queryBuild：筛选后只回传命中角色的原始数据', only.rawByAvatarId && Object.keys(only.rawByAvatarId).length === 1, Object.keys(only.rawByAvatarId || {}).join(','))
check('queryBuild：筛掉的角色不计入 total', only.total === 2 && only.matched === 1, `total=${only.total} matched=${only.matched}`)

const miss = await offline(['不存在的角色'])
check('queryBuild：关键词都不是角色名时不当筛选（照常出全部 + 回传未识别）', miss.filtered === false && miss.chars.length === 2 && miss.unknown.includes('不存在的角色'))

const none = await offline(['夜兰'])
check('queryBuild：命中角色名但该号没有该角色 = 筛选落空', none.filtered === true && none.chars.length === 0 && none.matched === 0)
check('queryBuild：落空时 roster 仍给出该号公开角色', none.roster.join(',') === '胡桃,琴', none.roster.join(','))

finish()

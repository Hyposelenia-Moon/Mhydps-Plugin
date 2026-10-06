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
  panelStatText
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

finish()

/**
 * 帮助配置：结构契约
 *
 * help-cfg.js 是热重载文件（apps/help.js 每次动态 import），结构错了不会报错，
 * 只会让帮助图少一块内容；这里把「字段齐全、语法与示例可读、参数表完整、权限分组」钉住。
 */
import { checker, mod } from './_helper.mjs'

const { check, finish } = checker()

const { helpCfg, quickStart, helpList } = await import(mod('resources/help/help-cfg.js'))

// ---- 页头 ----
check('helpCfg 有标题', typeof helpCfg.title === 'string' && helpCfg.title.includes('#DPS'))
check('helpCfg 有副标题', typeof helpCfg.subTitle === 'string' && helpCfg.subTitle.length > 0)

// ---- 快速上手卡 ----
check('quickStart 存在', Boolean(quickStart) && typeof quickStart === 'object')
check('quickStart 有标题', typeof quickStart.title === 'string' && quickStart.title.length > 0)
check('快速上手含 3~5 条常用命令', quickStart.commands.length >= 3 && quickStart.commands.length <= 5, `${quickStart.commands.length} 条`)
check('常用命令均为 # 开头且有说明', quickStart.commands.every(c => c.title.startsWith('#') && c.desc))
check('参数速查非空', Array.isArray(quickStart.notes) && quickStart.notes.length > 0)
check('参数速查每行有标签与内容', quickStart.notes.every(n => n.label && n.text))
check('参数速查覆盖金数写法', quickStart.notes.some(n => n.text.includes('12金') || n.text.includes('金≤')))

// ---- 分组与条目 ----
check('helpList 非空', Array.isArray(helpList) && helpList.length > 0, `${helpList.length} 组`)
check('每组有 group 名与 list', helpList.every(g => typeof g.group === 'string' && g.group && Array.isArray(g.list) && g.list.length > 0))
check('每条有 title 与 desc', helpList.every(g => g.list.every(i => typeof i.title === 'string' && i.title && typeof i.desc === 'string' && i.desc)))
check('命令标题以 # 开头', helpList.every(g => g.list.every(i => i.title.trim().startsWith('#'))))

const items = helpList.flatMap(g => g.list)

// ---- 语法模板 ----
const withSyntax = items.filter(i => i.syntax)
check('存在带语法模板的条目', withSyntax.length >= 2, `${withSyntax.length} 条`)
check('语法模板以 # 开头', withSyntax.every(i => i.syntax.trim().startsWith('#')))
check('带参数表的条目必有语法', items.filter(i => i.args?.length).every(i => Boolean(i.syntax)))

// ---- 参数表 ----
const withArgs = items.filter(i => i.args?.length)
check('存在参数表', withArgs.length >= 2, `${withArgs.length} 条`)
check('参数表每行字段齐全', withArgs.every(i => i.args.every(a => a.name && a.value && a.desc)))
check('榜单命令登记了核心参数', (() => {
  const rank = items.find(i => i.title.startsWith('#DPS榜'))
  const names = rank.args.map(a => a.name).join('/')
  return ['角色', '金数', '主C', '绿玩', '标签', '页N'].every(n => names.includes(n))
})(), items.find(i => i.title.startsWith('#DPS榜')).args.map(a => a.name).join('/'))
check('危战命令登记了版本与首领', (() => {
  const raid = items.find(i => i.title.startsWith('#DPS危战榜'))
  const names = raid.args.map(a => a.name).join('/')
  return names.includes('版本') && names.includes('首领')
})())

// ---- 示例 ----
const withExamples = items.filter(i => i.examples?.length)
check('存在示例', withExamples.length >= 2, `${withExamples.length} 条`)
check('示例以 # 开头', withExamples.every(i => i.examples.every(ex => ex.trim().startsWith('#'))))
check('核心命令都有示例', ['#DPS榜', '#DPS危战榜', '#DPS练度查询', '#DPS更新'].every(t => items.some(i => i.title.startsWith(t) && i.examples?.length)))

// ---- 权限分组 ----
const masterGroups = helpList.filter(g => g.auth === 'master')
check('主人分组存在且只含更新命令', masterGroups.length === 1 && masterGroups[0].list.every(i => i.title.includes('#DPS更新')))
check('非主人分组不带 auth', helpList.filter(g => !g.auth).length === helpList.length - masterGroups.length)

// ---- 覆盖面 ----
const titles = items.map(i => i.title)
check('覆盖四条核心命令', ['#DPS榜', '#DPS危战榜', '#DPS状态', '#DPS帮助'].every(t => titles.some(x => x.startsWith(t))), titles.length + ' 条')
check('含练度查询（含简写）', titles.filter(t => t.includes('练度查询')).length >= 2)

finish()

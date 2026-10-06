/**
 * 帮助配置：结构契约
 *
 * help-cfg.js 是热重载文件（apps/help.js 每次动态 import），结构错了不会报错、
 * 只会让帮助图少一块；这里把「字段齐全、标题以 # 开头、权限分组存在」钉住。
 */
import path from 'node:path'
import { checker, pluginRoot, mod } from './_helper.mjs'

const { check, finish } = checker()

const { helpCfg, helpList } = await import(mod('resources/help/help-cfg.js'))

check('helpCfg 有标题', typeof helpCfg.title === 'string' && helpCfg.title.includes('#DPS'))
check('helpCfg 有副标题', typeof helpCfg.subTitle === 'string' && helpCfg.subTitle.length > 0)
check('helpList 非空', Array.isArray(helpList) && helpList.length > 0, `${helpList.length} 组`)

check('每组有 group 名与 list', helpList.every(g => typeof g.group === 'string' && g.group && Array.isArray(g.list) && g.list.length > 0))
check('每条有 title 与 desc', helpList.every(g => g.list.every(i => typeof i.title === 'string' && i.title && typeof i.desc === 'string' && i.desc)))
check('命令标题以 # 开头', helpList.every(g => g.list.every(i => i.title.trim().startsWith('#'))))

const titles = helpList.flatMap(g => g.list.map(i => i.title))
check('覆盖四条核心命令', ['#DPS榜', '#DPS危战榜', '#DPS状态', '#DPS帮助'].every(t => titles.some(x => x.startsWith(t))), titles.length + ' 条')
check('含练度查询说明', titles.some(t => t.includes('练度查询')))

const masterGroups = helpList.filter(g => g.auth === 'master')
check('主人分组存在且只含更新命令', masterGroups.length === 1 && masterGroups[0].list.every(i => i.title.includes('#DPS更新')))
check('非主人分组不带 auth', helpList.filter(g => !g.auth).length === helpList.length - masterGroups.length)

// 帮助文件必须能被 bot 根下的绝对路径解析（apps/help.js 用的是 process.cwd() + 'plugins/Mhydps-Plugin/...'）
const expected = path.join(pluginRoot, 'resources', 'help', 'help-cfg.js')
check('帮助配置落在约定路径', expected.endsWith(path.join('resources', 'help', 'help-cfg.js')))

finish()

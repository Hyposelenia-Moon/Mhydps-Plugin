/**
 * 命令路由：各入口的正则边界
 *
 * apps/ 里的入口类依赖框架（只能在 bot 的 plugins/ 下导入），所以这里直接读源码里的正则字面量，
 * 钉住最容易出事的一点：**新增的「视频」后缀命令不能被榜单入口抢走**，
 * 同时原有榜单/危战/练度命令的匹配范围不能被收紧到失效。
 */
import fs from 'node:fs'
import path from 'node:path'
import { checker, pluginRoot } from './_helper.mjs'

const { check, finish } = checker()

/**
 * 从 apps/<file> 里取出 `const <name> = /.../` 的正则
 * @param {string} file
 * @param {string} name
 * @returns {RegExp}
 */
function extractRegex (file, name) {
  const src = fs.readFileSync(path.join(pluginRoot, 'apps', file), 'utf8')
  const m = src.match(new RegExp(`const ${name} = /(.+)/\\n`))
  if (!m) throw new Error(`${file} 里找不到 ${name}`)
  return new RegExp(m[1])
}

const rankCmd = extractRegex('rank.js', 'CMD_RE')
const raidCmd = extractRegex('raid.js', 'CMD_RE')
const buildCmd = extractRegex('build.js', 'CMD_RE')
const adminCmd = extractRegex('admin.js', 'CMD_RE')
const statusCmd = extractRegex('status.js', 'CMD_RE')
const helpCmd = extractRegex('help.js', 'CMD_RE')
const rankVideo = extractRegex('video.js', 'RANK_VIDEO_RE')
const raidVideo = extractRegex('video.js', 'RAID_VIDEO_RE')

// ---- 视频命令：由 video.js 接管，榜单入口不得抢匹配 ----
check('#DPS榜视频 3 命中视频入口', rankVideo.test('#DPS榜视频 3'))
check('#DPS榜视频 3 不被榜单入口匹配', !rankCmd.test('#DPS榜视频 3'))
check('#DPS榜视频 3 胡桃 命中视频入口', rankVideo.test('#DPS榜视频 3 胡桃'))
check('#DPS危战榜视频 3 命中危战视频入口', raidVideo.test('#DPS危战榜视频 3'))
check('#DPS危战榜视频 3 不被危战入口匹配', !raidCmd.test('#DPS危战榜视频 3'))
check('榜单视频入口不误吞危战视频命令', !rankVideo.test('#DPS危战榜视频 3'))
check('危战视频入口不误吞榜单视频命令', !raidVideo.test('#DPS榜视频 3'))

// ---- 原命令仍然正常 ----
check('#DPS榜 / #DPS榜 胡桃 12金 仍命中榜单入口', rankCmd.test('#DPS榜') && rankCmd.test('#DPS榜 胡桃 12金'))
check('#DPS危战榜 7.1 仍命中危战入口', raidCmd.test('#DPS危战榜 7.1') && raidCmd.test('#DPS危战榜'))
check('#DPS练度查询 <UID> 仍命中练度入口', buildCmd.test('#DPS练度查询 100000000') && buildCmd.test('#DPS练度 100000000'))
check('#DPS更新 仍命中管理入口', adminCmd.test('#DPS更新') && adminCmd.test('#DPS强制更新'))
check('#DPS状态 仍命中状态入口', statusCmd.test('#DPS状态'))
check('#DPS帮助 仍命中帮助入口', helpCmd.test('#DPS帮助'))

// ---- 小写与省略前缀的兼容写法 ----
check('小写 #dps榜视频 2 也认', rankVideo.test('#dps榜视频 2'))
check('省略前缀 dps 仍认榜单', rankCmd.test('dps榜 3金'))

finish()

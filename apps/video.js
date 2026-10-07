import plugin from '../../../lib/plugins/plugin.js'
import { getPluginConfig, getProxy } from '../components/config.js'
import { parseRankArgs, parseRaidArgs, takeRankNo } from '../modules/queryArgs.js'
import { findRankEntry } from '../modules/rankQuery.js'
import { findRaidEntry } from '../modules/raidQuery.js'
import { entryText } from '../modules/formatText.js'
import { suggestLine } from '../modules/respond.js'

const config = getPluginConfig()

/** `#DPS榜视频 <名次> [角色] [金数] ...` */
const RANK_VIDEO_RE = /^#?(?:dps|DPS)?视频\s*([\s\S]*)$/
/** `#DPS危战榜视频 <名次> [版本] [首领] ...` */
const RAID_VIDEO_RE = /^#?(?:dps|DPS)?危战视频\s*([\s\S]*)$/

export class MhydpsVideo extends plugin {
  constructor () {
    super({
      name: 'Mhydps视频查询',
      dsc: '#DPS榜视频 <名次> / #DPS危战榜视频 <名次>',
      event: 'message',
      // 7900 < 榜单类入口(8000)：`#DPS榜视频` 先由本插件接管
      priority: config.priority ? config.priority - 100 : 7900,
      rule: [
        { reg: RANK_VIDEO_RE, fnc: 'handleRankVideo', permission: 'all' },
        { reg: RAID_VIDEO_RE, fnc: 'handleRaidVideo', permission: 'all' }
      ]
    })
  }

  /** #DPS榜视频 — 取 DPS 榜第 N 名的 B 站视频链接（支持与榜单相同的筛选） */
  async handleRankVideo (e) {
    const { rankNo, rest } = takeRankNo((e.msg.match(RANK_VIDEO_RE) || [])[1] || '')
    if (!rankNo) {
      await e.reply('[Mhydps] 用法：#DPS榜视频 <名次>，例如 #DPS榜视频 3（可加角色/金数等筛选）')
      return true
    }

    const result = await findRankEntry(parseRankArgs(rest), rankNo, { proxy: getProxy() })
    if (!result.ok) {
      await e.reply(`[Mhydps] ${result.error}${suggestLine(result.suggestions)}`)
      return true
    }

    await e.reply(entryText(result, 'rank'))
    return true
  }

  /** #DPS危战榜视频 — 取危战榜第 N 名的 B 站视频链接（支持版本/首领等筛选） */
  async handleRaidVideo (e) {
    const { rankNo, rest } = takeRankNo((e.msg.match(RAID_VIDEO_RE) || [])[1] || '')
    if (!rankNo) {
      await e.reply('[Mhydps] 用法：#DPS危战榜视频 <名次>，例如 #DPS危战榜视频 3（可加版本/首领筛选）')
      return true
    }

    const result = await findRaidEntry(parseRaidArgs(rest), rankNo, { proxy: getProxy() })
    if (!result.ok) {
      await e.reply(`[Mhydps] ${result.error}${suggestLine(result.suggestions)}`)
      return true
    }

    await e.reply(entryText(result, 'raid'))
    return true
  }
}

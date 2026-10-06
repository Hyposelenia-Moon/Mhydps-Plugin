import plugin from '../../../lib/plugins/plugin.js'
import { getPluginConfig, getProxy } from '../components/config.js'
import { COPYRIGHT, SITE_NAME, formatTime } from '../components/constants.js'
import { parseRaidArgs } from '../modules/queryArgs.js'
import { queryRaid } from '../modules/raidQuery.js'
import { raidText } from '../modules/formatText.js'
import { respond, suggestLine } from '../modules/respond.js'

const config = getPluginConfig()

/** `#DPS危战榜` / `#危战榜` / `#DPS危战排行榜` */
const CMD_RE = /^#?(?:dps|DPS)?(?:危战榜|危战|危战排行榜|危战排行)(?!榜?视频)\s*([\s\S]*)$/

const TITLE = '#DPS危战榜'

export class MhydpsRaid extends plugin {
  constructor () {
    super({
      name: 'Mhydps危战榜',
      dsc: '#DPS危战榜 [版本] [首领] [角色] [金数] [页N]',
      event: 'message',
      // 7980 < 8000：危战类命令先于宽泛的 #DPS 规则被检查
      priority: config.priority ? config.priority - 20 : 7980,
      rule: [
        { reg: CMD_RE, fnc: 'handleRaid', permission: 'all' }
      ]
    })
  }

  /**
   * #DPS危战榜 — 危战榜单（默认按金数升序、同金数比耗时）
   * 例：#DPS危战榜 / #DPS危战榜 7.1 / #DPS危战榜 玛薇卡 / #DPS危战榜 版本:7.1 首领:矮灵雕刻师
   */
  async handleRaid (e) {
    const text = (e.msg.match(CMD_RE) || [])[1] || ''
    const args = parseRaidArgs(text)

    const result = await queryRaid(args, { proxy: getProxy() })

    if (!result.ok) {
      await e.reply(`[Mhydps] ${result.error}${suggestLine(result.suggestions)}`)
      return true
    }

    const data = {
      siteName: SITE_NAME,
      title: TITLE,
      subtitle: result.subtitle,
      fetchedAt: formatTime(result.fetchedAt),
      total: result.total,
      page: result.page,
      totalPages: result.totalPages,
      rows: result.rows,
      copyright: COPYRIGHT
    }

    return await respond(e, 'raid', data, () => raidText(result, TITLE))
  }
}

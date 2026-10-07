import plugin from '../../../lib/plugins/plugin.js'
import { getPluginConfig, getProxy } from '../components/config.js'
import { COPYRIGHT, SITE_NAME, formatTime } from '../components/constants.js'
import { parseRankArgs } from '../modules/queryArgs.js'
import { queryRank } from '../modules/rankQuery.js'
import { rankText } from '../modules/formatText.js'
import { respond, suggestLine } from '../modules/respond.js'

const config = getPluginConfig()

/** `#DPS榜` / `#DPS排行` / `#DPS排名` */
const CMD_RE = /^#?(?:dps|DPS)榜?(?!视频|帮助|状态|更新|刷新|练度|危战)\s*([\s\S]*)$/

/** 文本回退与图标题 */
const TITLE = '#DPS榜'

export class MhydpsRank extends plugin {
  constructor () {
    super({
      name: 'MhydpsDPS榜',
      dsc: '#DPS榜 [角色] [金数] [标签] [主C] [绿玩] [页N]',
      event: 'message',
      // 8000 < Atlas(10000)：`#DPS…` 先由本插件接管，未命中会自然放行给其它插件
      priority: config.priority || 8000,
      rule: [
        { reg: CMD_RE, fnc: 'handleRank', permission: 'all' }
      ]
    })
  }

  /**
   * #DPS榜 — 原神 DPS 数据库配队榜单
   * 例：#DPS榜 / #DPS榜 胡桃 / #DPS榜 胡桃 12金 / #DPS榜 胡桃 主C 绿玩 -p2
   */
  async handleRank (e) {
    const text = (e.msg.match(CMD_RE) || [])[1] || ''
    const args = parseRankArgs(text)

    const result = await queryRank(args, { proxy: getProxy() })

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
      pageSize: result.pageSize,
      rows: result.rows,
      copyright: COPYRIGHT
    }

    return await respond(e, 'rank', data, () => rankText(result, TITLE))
  }
}

import plugin from '../../../lib/plugins/plugin.js'
import { getPluginConfig, getProxy } from '../components/config.js'
import { COPYRIGHT, SITE_NAME } from '../components/constants.js'
import { queryBuild } from '../modules/buildQuery.js'
import { buildText } from '../modules/formatText.js'
import { respond } from '../modules/respond.js'

const config = getPluginConfig()

/** `#DPS练度查询 123456789` / `#练度查询 123456789` / `#DPS练度 123456789` */
const CMD_RE = /^#?(?:dps|DPS)?(?:练度查询|练度面板|练度)\s*(\d{9})\s*$/

const TITLE = '#DPS练度查询'

export class MhydpsBuild extends plugin {
  constructor () {
    super({
      name: 'Mhydps练度查询',
      dsc: '#DPS练度查询 <UID>',
      event: 'message',
      priority: config.priority || 8000,
      rule: [
        { reg: CMD_RE, fnc: 'handleBuild', permission: 'all' }
      ]
    })
  }

  /**
   * #DPS练度查询 — 通过站点代理的 Enka 数据展示角色面板与圣遗物明细
   * 每位玩家同一时间只能查到公开了「角色详情」的账号
   */
  async handleBuild (e) {
    const uid = (e.msg.match(CMD_RE) || [])[1] || ''

    let result
    try {
      result = await queryBuild(uid, { proxy: getProxy() })
    } catch (err) {
      await e.reply(`[Mhydps] 练度查询失败：${err.message}`)
      return true
    }

    const data = {
      siteName: SITE_NAME,
      title: TITLE,
      player: result.player,
      chars: result.chars,
      copyright: COPYRIGHT
    }

    return await respond(e, 'build', data, () => buildText(result, TITLE))
  }
}

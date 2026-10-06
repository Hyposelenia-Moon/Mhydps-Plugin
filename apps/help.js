import plugin from '../../../lib/plugins/plugin.js'
import { getPluginConfig } from '../components/config.js'
import { COPYRIGHT, SITE_NAME } from '../components/constants.js'
import { renderDps } from '../components/render.js'

const config = getPluginConfig()

/** `#DPS帮助` */
const CMD_RE = /^#?(?:dps|DPS)帮助$/

const TITLE = '#DPS帮助'

export class MhydpsHelp extends plugin {
  constructor () {
    super({
      name: 'Mhydps帮助',
      dsc: '#DPS帮助',
      event: 'message',
      priority: config.priority ? config.priority - 10 : 7990,
      rule: [
        { reg: CMD_RE, fnc: 'handleHelp', permission: 'all' }
      ]
    })
  }

  /**
   * #DPS帮助 — 渲染帮助图
   * 动态 import help-cfg.js（带时间戳绕过 ESM 缓存），改帮助文案无需重启 bot
   */
  async handleHelp (e) {
    try {
      const helpPath = `${process.cwd()}/plugins/Mhydps-Plugin/resources/help/help-cfg.js`
      const { helpCfg, helpList } = await import(`file://${helpPath}?t=${Date.now()}`)

      const helpGroup = helpList
        .filter(group => group.auth !== 'master' || e.isMaster)
        .map(group => ({
          group: group.group,
          list: group.list.map(item => ({ title: item.title, desc: item.desc }))
        }))

      const data = { siteName: SITE_NAME, helpCfg, helpGroup, copyright: COPYRIGHT }
      const img = await renderDps('help', data)
      if (img) {
        await e.reply(img)
        return true
      }
      throw new Error('渲染结果为空')
    } catch (err) {
      logger?.error?.(`[Mhydps] 帮助图渲染失败：${err?.message || err}`)
    }

    // 文本回退：与 help-cfg.js 内容保持一致的要点版
    await e.reply(
      `${TITLE}｜${SITE_NAME}\n`
      + '· #DPS榜 [角色] [金数] [标签] [主C] [绿玩] [第N页] — DPS 数据库配队榜\n'
      + '· #DPS危战榜 [版本] [首领] [角色] [金数] [第N页] — 危战榜单\n'
      + '· #DPS练度查询 <9位UID> — 角色面板与圣遗物明细（Enka 数据）\n'
      + '· #DPS状态 — 缓存时间与条数\n'
      + '· #DPS帮助 — 本帮助\n'
      + (e.isMaster ? '· #DPS更新 — 立即刷新榜单缓存（仅主人）\n' : '')
    )
    return true
  }
}

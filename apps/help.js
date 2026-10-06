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
    // 文本回退与出图共用同一份数据，失败时才能保证内容一致
    let helpCfg = { title: TITLE, subTitle: '' }
    let helpGroup = []
    let quickStart = null

    try {
      const helpPath = `${process.cwd()}/plugins/Mhydps-Plugin/resources/help/help-cfg.js`
      const cfgMod = await import(`file://${helpPath}?t=${Date.now()}`)
      helpCfg = cfgMod.helpCfg || helpCfg
      quickStart = cfgMod.quickStart || null

      helpGroup = (cfgMod.helpList || [])
        .filter(group => group.auth !== 'master' || e.isMaster)
        .map(group => ({
          group: group.group,
          list: group.list.map(item => ({
            title: item.title,
            desc: item.desc,
            syntax: item.syntax,
            args: item.args,
            examples: item.examples
          }))
        }))

      const data = { siteName: SITE_NAME, helpCfg, quickStart, helpGroup, copyright: COPYRIGHT }
      const img = await renderDps('help', data)
      if (img) {
        await e.reply(img)
        return true
      }
      throw new Error('渲染结果为空')
    } catch (err) {
      logger?.error?.(`[Mhydps] 帮助图渲染失败：${err?.message || err}`)
    }

    await e.reply(this.textOf({ helpCfg, quickStart, helpGroup, isMaster: e.isMaster }))
    return true
  }

  /**
   * 文本回退：按分组列命令与说明，并带上参数速查
   * @param {object} view - { helpCfg, quickStart, helpGroup, isMaster }
   * @returns {string}
   */
  textOf (view) {
    const lines = [view.helpCfg?.title || TITLE]
    if (view.helpCfg?.subTitle) lines.push(view.helpCfg.subTitle)

    if (view.quickStart?.notes?.length) {
      lines.push('', '【参数速查】')
      for (const note of view.quickStart.notes) {
        lines.push(`· ${note.label}：${note.text}`)
      }
    }

    for (const group of view.helpGroup) {
      lines.push('', `【${group.group}】`)
      for (const item of group.list) {
        lines.push(`· ${item.title}${item.desc ? ` — ${item.desc}` : ''}`)
        if (item.examples?.length) lines.push(`   例：${item.examples.join('　')}`)
      }
    }

    if (!view.isMaster) lines.push('', '（主人指令：#DPS更新）')
    return lines.join('\n')
  }
}

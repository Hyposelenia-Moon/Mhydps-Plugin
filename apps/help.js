import fs from 'node:fs'
import path from 'node:path'
import plugin from '../../../lib/plugins/plugin.js'
import { getPluginConfig } from '../components/config.js'
import { COPYRIGHT } from '../components/constants.js'
import { pluginVersion, versionText } from '../components/pluginVersion.js'
import { renderDps } from '../components/render.js'

const config = getPluginConfig()

/** 版本兜底：pluginVersion.js 读不到 package.json 时为 unknown，页脚仍要有可读内容 */
const heroVersion = versionText || `Mhydps-Plugin ${pluginVersion}`

/** `#DPS帮助` */
const CMD_RE = /^#?(?:dps|DPS)帮助$/

const TITLE = '#DPS帮助'

/** 帮助页可选背景图（放在 resources/common/ 下，按此顺序取第一张存在的） */
const HERO_BG_CANDIDATES = ['help-bg.webp', 'help-bg.png', 'help-bg.jpg', 'help-bg.jpeg']

/**
 * 找可用的帮助页背景图
 *
 * 有图就用图（铺在页头，叠一层白色遮罩保证文字可读），没图回落浅色渐变。
 * 由使用者自行放入图片文件，仓库不携带任何美术资源。
 * @returns {string} 文件名（供模板拼 {{_res_path}}/common/<name>），无图返回空串
 */
function findHeroBg () {
  const dir = path.join(process.cwd(), 'plugins', 'Mhydps-Plugin', 'resources', 'common')
  return HERO_BG_CANDIDATES.find(name => fs.existsSync(path.join(dir, name))) || ''
}

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

    try {
      const helpPath = `${process.cwd()}/plugins/Mhydps-Plugin/resources/help/help-cfg.js`
      const cfgMod = await import(`file://${helpPath}?t=${Date.now()}`)
      helpCfg = cfgMod.helpCfg || helpCfg

      helpGroup = (cfgMod.helpList || [])
        .filter(group => group.auth !== 'master' || e.isMaster)
        .map(group => ({
          group: group.group,
          list: group.list.map(item => ({ title: item.title, desc: item.desc }))
        }))

      const data = {
        helpCfg,
        helpGroup,
        helpBg: findHeroBg(),
        versionText: heroVersion,
        copyright: COPYRIGHT
      }
      const img = await renderDps('help', data)
      if (img) {
        await e.reply(img)
        return true
      }
      throw new Error('渲染结果为空')
    } catch (err) {
      logger?.error?.(`[Mhydps] 帮助图渲染失败：${err?.message || err}`)
    }

    await e.reply(this.textOf({ helpCfg, helpGroup, isMaster: e.isMaster }))
    return true
  }

  /**
   * 文本回退：按分组列命令与一行说明
   * @param {object} view - { helpCfg, helpGroup, isMaster }
   * @returns {string}
   */
  textOf (view) {
    const lines = [view.helpCfg?.title || TITLE]
    if (view.helpCfg?.subTitle) lines.push(view.helpCfg.subTitle)

    for (const group of view.helpGroup) {
      lines.push('', `【${group.group}】`)
      for (const item of group.list) {
        lines.push(`· ${item.title}${item.desc ? ` — ${item.desc}` : ''}`)
      }
    }

    if (!view.isMaster) lines.push('', '（主人指令：#DPS更新）')
    return lines.join('\n')
  }
}

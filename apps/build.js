import plugin from '../../../lib/plugins/plugin.js'
import { getPluginConfig, getProxy } from '../components/config.js'
import { COPYRIGHT, SITE_NAME } from '../components/constants.js'
import { queryBuild } from '../modules/buildQuery.js'
import { buildText } from '../modules/formatText.js'
import { respond } from '../modules/respond.js'
import { parseBuildArgs } from '../modules/queryArgs.js'

const config = getPluginConfig()

/**
 * `#DPS练度查询 [角色…] [UID]` —— 参数顺序随意，UID 与角色名都可省
 *   #DPS练度查询 123456789        该 UID 全部公开角色
 *   #DPS练度查询 胡桃             只看胡桃（UID 取配置 defaultUid）
 *   #DPS练度查询 胡桃 123456789   两者都给
 */
const CMD_RE = /^#?(?:dps|DPS)?(?:练度查询|练度面板|练度)\s*([\s\S]*)$/

const TITLE = '#DPS练度查询'

/** 没给 UID 也没配 defaultUid 时的用法提示 */
const USAGE = [
  `${TITLE} <UID> — 该 UID 的全部公开角色`,
  `${TITLE} <角色> [UID] — 只看指定角色（可写多个，如「胡桃 夜兰」）`,
  '例：#DPS练度查询 胡桃　#DPS练度查询 胡桃 123456789',
  '未填 UID 时用配置项 defaultUid（锅巴里可设）'
].join('\n')

export class MhydpsBuild extends plugin {
  constructor () {
    super({
      name: 'Mhydps练度查询',
      dsc: '#DPS练度查询 [角色] [UID]',
      event: 'message',
      // 7950 < 8000：练度命令先于宽泛的 #DPS 规则被检查
      priority: config.priority ? config.priority - 50 : 7950,
      rule: [
        { reg: CMD_RE, fnc: 'handleBuild', permission: 'all' }
      ]
    })
  }

  /**
   * #DPS练度查询 — 通过站点代理的 Enka 数据展示角色面板与圣遗物明细
   * 每位玩家同一时间只能查到公开了「角色详情」的账号；给了角色名时只渲染这些角色
   */
  async handleBuild (e) {
    const text = (e.msg.match(CMD_RE) || [])[1] || ''
    const args = parseBuildArgs(text)
    const uid = args.uid || String(getPluginConfig()?.defaultUid || '').trim()

    if (!uid) {
      await e.reply(USAGE)
      return true
    }
    if (!/^\d{9}$/.test(uid)) {
      await e.reply(`[Mhydps] UID 需要是 9 位数字，收到的是「${uid}」`)
      return true
    }

    let result
    try {
      result = await queryBuild(uid, { proxy: getProxy(), names: args.names })
    } catch (err) {
      await e.reply(`[Mhydps] 练度查询失败：${err.message}`)
      return true
    }

    // 筛选后一个都没命中：直接文本回复并列出该号公开的角色名，避免出一张空图
    if (result.filtered && !result.chars.length) {
      const asked = args.names.join('、')
      const roster = result.roster.length ? result.roster.join('、') : '（无）'
      await e.reply([
        `[Mhydps] 没在 UID ${uid} 的公开角色里找到：${asked}`,
        `该号公开角色（${result.roster.length}）：${roster}`,
        result.unknown.length ? `未识别的参数：${result.unknown.join('、')}` : '',
        '提示：角色名可写别名（如「桃」「胡堂主」）；也可能该角色未公开详情'
      ].filter(Boolean).join('\n'))
      return true
    }

    const notice = [
      result.unknown.length ? `未识别的参数：${result.unknown.join('、')}` : '',
      result.filtered ? `已按 ${args.names.join('、')} 筛选（命中 ${result.chars.length} 个）` : '',
      result.truncated ? `公开角色较多，仅展示前 ${result.chars.length} 个` : ''
    ].filter(Boolean).join('　')

    const data = {
      siteName: SITE_NAME,
      title: TITLE,
      player: result.player,
      chars: result.chars,
      assets: result.assets,
      notice,
      copyright: COPYRIGHT
    }

    return await respond(e, 'build', data, () => buildText(result, TITLE))
  }
}

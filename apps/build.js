import plugin from '../../../lib/plugins/plugin.js'
import { getPluginConfig, getProxy } from '../components/config.js'
import { queryBuild } from '../modules/buildQuery.js'
import { buildText } from '../modules/formatText.js'
import { parseBuildArgs } from '../modules/queryArgs.js'
import { pickProfileImage } from '../model/ProfileImg.js'
import { buildMiaoProfile, fileUrl, loadMiao, renderMiaoPanel, toPanelData } from '../model/MiaoBridge.js'

const config = getPluginConfig()

/**
 * `#DPS练度查询 [角色…] [UID]` —— 参数顺序随意，UID 与角色名都可省
 *   #DPS练度查询 123456789        该 UID 面板（默认出等级最高的那个角色）
 *   #DPS练度查询 胡桃             只看胡桃（UID 取配置 defaultUid）
 *   #DPS练度查询 胡桃 123456789   两者都给
 */
const CMD_RE = /^#?(?:dps|DPS)?(?:练度查询|练度面板|练度)\s*([\s\S]*)$/

const TITLE = '#DPS练度查询'

/** 没给 UID 也没配 defaultUid 时的用法提示 */
const USAGE = [
  `${TITLE} <UID> — 该 UID 的角色面板（默认出等级最高的那个）`,
  `${TITLE} <角色> [UID] — 指定角色（可写多个，如「胡桃 夜兰」）`,
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
   * #DPS练度查询 — 数据走站点代理的 Enka，画面整页交给 miao-plugin 的面板代码
   *
   * 出图链路（model/MiaoBridge.js）：原始 Enka avatarInfo → miao 的 EnkaData/Avatar
   * （名字、图标、面板数值、圣遗物评分都由 miao 现算）→ miao 的 profile-detail 模板截图。
   * miao-plugin 不可用时回退本插件的纯文本输出。
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

    // 官方面板一次只呈现一个角色，这里默认出等级最高的那个（角色名命中时通常就一个）
    const target = result.chars[0]
    const paintNotice = [
      result.unknown.length ? `未识别的参数：${result.unknown.join('、')}` : '',
      result.chars.length > 1
        ? `该号还有 ${result.chars.length - 1} 个公开角色：${result.chars.slice(1).map(c => c.name).join('、')}（用 #DPS练度查询 <角色> 逐个查看）`
        : '',
      result.truncated ? `公开角色较多，仅展示等级最高的一个` : ''
    ].filter(Boolean).join('\n')

    const painted = await this.paintMiaoPanel(e, uid, target, result.rawByAvatarId?.[target.avatarId])
    if (painted) {
      if (paintNotice) await e.reply(paintNotice)
      return true
    }

    // miao-plugin 不可用（或解析失败）→ 文本回退，附带一行说明
    if (paintNotice) await e.reply(paintNotice)
    await e.reply(`[Mhydps] 未检测到可用的 miao-plugin 面板代码，已回退文本输出\n${buildText(result, TITLE)}`)
    return true
  }

  /**
   * 用 miao-plugin 自己的面板代码出图
   * @param {object} e
   * @param {string} uid
   * @param {object} view - buildQuery 的角色视图（取 name/avatarId）
   * @param {object} rawAvatar - 站点返回的原始 Enka avatarInfo
   * @returns {Promise<boolean>} 是否已出图
   */
  async paintMiaoPanel (e, uid, view, rawAvatar) {
    if (!view || !rawAvatar) return false
    try {
      const miao = await loadMiao()
      if (!miao) return false
      const profile = await buildMiaoProfile(uid, rawAvatar)
      if (!profile) return false
      // 面板立绘用本机 ProfileImg 图库（按角色名匹配，同 UID 稳定取图）；没有图库时留空，
      // miao 会退回它自己的官方立绘
      const costumeSplash = fileUrl(pickProfileImage(view.name, view.avatarId))
      const panelData = await toPanelData({ uid, profile, costumeSplash })
      if (!panelData) return false
      return await renderMiaoPanel(e, panelData)
    } catch (err) {
      logger?.error?.(`[Mhydps] miao 面板渲染失败：${err?.message || err}`)
      return false
    }
  }
}

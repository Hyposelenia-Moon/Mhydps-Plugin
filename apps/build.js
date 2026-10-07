import plugin from '../../../lib/plugins/plugin.js'
import { getAkashaEnabled, getPluginConfig } from '../components/config.js'
import { AKASHA_NAME, COPYRIGHT } from '../components/constants.js'
import { parseBuildArgs } from '../modules/queryArgs.js'
import { findCharacter } from '../model/CharacterIndex.js'
import {
  fetchAkashaProfile,
  fetchAkashaTranslations,
  setTransport
} from '../model/AkashaClient.js'
import { akashaBrowserTransport } from '../model/AkashaBrowser.js'
import {
  buildAkashaView,
  collectNameWords,
  filterAkashaChars
} from '../modules/akashaQuery.js'
import { akashaText } from '../modules/formatText.js'
import { respond } from '../modules/respond.js'

const config = getPluginConfig()

/**
 * `#DPS练度查询 [角色…] [UID]` —— 数据源：akasha.cv（参数顺序随意，两者都可省其一）
 *   #DPS练度查询 123456789        该 UID 的练度（按名次排序）
 *   #DPS练度查询 胡桃             只看胡桃（UID 取配置 defaultUid）
 *   #DPS练度查询 胡桃 123456789   两者都给
 */
const CMD_RE = /^#?(?:dps|DPS)?(?:练度查询|练度面板|练度)\s*([\s\S]*)$/

const TITLE = '#DPS练度查询'

/** 没给 UID 也没配 defaultUid 时的用法提示 */
const USAGE = [
  `${TITLE} <UID> — 该 UID 在 akasha 上的角色练度（名次 / top% / 伤害）`,
  `${TITLE} <角色> [UID] — 只看指定角色（可写多个，如「胡桃 夜兰」）`,
  '例：#DPS练度查询 胡桃　#DPS练度查询 胡桃 123456789',
  '未填 UID 时用配置项 defaultUid（锅巴 → 数据源二 · akasha.cv）'
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
   * 练度查询 —— 数据全部来自 akasha.cv（mhydps 只有匿名配队榜，没有练度排名）
   *
   * akasha 的 /api/ 在 Cloudflare 后面，纯 HTTP 会被 403 挡，所以取数走浏览器会话：
   * setTransport(akashaBrowserTransport) → 打开个人页 / 拦截页面自身的 /api/ 响应。
   */
  async handleBuild (e) {
    const text = (e.msg.match(CMD_RE) || [])[1] || ''
    const args = parseBuildArgs(text)
    const uid = args.uid || String(getPluginConfig()?.defaultUid || '').trim()

    if (!getAkashaEnabled()) {
      await e.reply('[Mhydps] 练度查询已关闭（锅巴 → 数据源二 · akasha.cv → 启用练度查询）')
      return true
    }
    if (!uid) {
      await e.reply(USAGE)
      return true
    }
    if (!/^\d{9}$/.test(uid)) {
      await e.reply(`[Mhydps] UID 需要是 9 位数字，收到的是「${uid}」`)
      return true
    }

    // 角色筛选靠本插件的角色表（akasha 返回英文名，别名只有本地表认）
    const records = args.names.map(n => findCharacter(n)).filter(Boolean)

    let view
    try {
      setTransport(akashaBrowserTransport)
      const profile = await fetchAkashaProfile(uid)
      // 武器/套装名中文化；拿不到就保留英文，不影响主体数据
      let translations = {}
      try {
        translations = await fetchAkashaTranslations(collectNameWords(profile.calculations))
      } catch (err) {
        logger?.warn?.(`[Mhydps] akasha 名字中文化失败（保留英文）：${err?.message || err}`)
      }
      view = buildAkashaView(profile, { translations })
    } catch (err) {
      logger?.error?.(`[Mhydps] akasha 练度查询失败：${err?.message || err}`)
      await e.reply([
        `[Mhydps] 练度查询失败：${err?.message || err}`,
        `数据源：${AKASHA_NAME}（该站 /api/ 在 Cloudflare 后面，需要本机有可用浏览器）`
      ].join('\n'))
      return true
    }

    let chars = view.chars
    const notices = []
    if (args.unknown.length) notices.push(`未识别的参数：${args.unknown.join('、')}`)
    if (records.length) {
      chars = filterAkashaChars(chars, records)
      notices.push(chars.length
        ? `已按 ${args.names.join('、')} 筛选（命中 ${chars.length} 个）`
        : `akasha 上没有 ${args.names.join('、')} 的记录（该号收录 ${view.total} 个角色）`)
    }
    if (view.total > view.chars.length) notices.push(`收录角色较多，仅列前 ${view.chars.length} 个`)

    const data = {
      title: TITLE,
      player: view.player,
      chars,
      total: view.total,
      notice: notices.join('　'),
      source: AKASHA_NAME,
      copyright: COPYRIGHT
    }

    if (!chars.length) {
      await e.reply([notices.join('\n'), akashaText({ ...view, chars: [] }, TITLE)].filter(Boolean).join('\n'))
      return true
    }

    return await respond(e, 'build', data, () => akashaText({ ...view, chars }, TITLE))
  }
}

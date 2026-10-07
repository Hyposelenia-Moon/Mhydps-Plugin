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
  akashaAttr,
  buildAkashaAvatar,
  loadMiao,
  renderMiaoPanel,
  toPanelData
} from '../model/MiaoPanel.js'
import { buildAkashaView, collectNameWords, filterAkashaChars } from '../modules/akashaQuery.js'
import { akashaText } from '../modules/formatText.js'

const config = getPluginConfig()

/**
 * `#DPS练度查询 [角色…] [UID]` —— 数据源：akasha.cv；画面：miao-plugin 的面板
 *   #DPS练度查询 123456789        该 UID 练度最好的那个角色的面板
 *   #DPS练度查询 胡桃             只看胡桃（UID 取配置 defaultUid）
 *   #DPS练度查询 胡桃 123456789   两者都给
 */
const CMD_RE = /^#?(?:dps|DPS)练度查询\s*([\s\S]*)$/

const TITLE = '#DPS练度查询'

const USAGE = [
  `${TITLE} <UID> — 用 miao 的面板展示该 UID 在 akasha 上的练度`,
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
      priority: config.priority ? config.priority - 50 : 7950,
      rule: [
        { reg: CMD_RE, fnc: 'handleBuild', permission: 'all' }
      ]
    })
  }

  /**
   * 练度查询：akasha 取数（浏览器会话）→ miao 面板出图 → 失败回退文本
   *
   * 面板里的数值全部来自 akasha：等级/命座/天赋/武器/面板 stats；
   * 圣遗物区刻意留空（akasha 不提供副词条），由文本说明，不编数字。
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

    const records = args.names.map(n => findCharacter(n)).filter(Boolean)
    const notices = []
    if (args.unknown.length) notices.push(`未识别的参数：${args.unknown.join('、')}`)

    let profile
    try {
      setTransport(akashaBrowserTransport)
      profile = await fetchAkashaProfile(uid)
    } catch (err) {
      logger?.error?.(`[Mhydps] akasha 练度查询失败：${err?.message || err}`)
      await e.reply([
        `[Mhydps] 练度查询失败：${err?.message || err}`,
        `数据源：${AKASHA_NAME}（该站 /api/ 在 Cloudflare 后面，需要本机有可用浏览器）`
      ].join('\n'))
      return true
    }

    let translations = {}
    try {
      translations = await fetchAkashaTranslations(collectNameWords(profile.calculations))
    } catch (err) {
      logger?.warn?.(`[Mhydps] akasha 名字中文化失败（保留英文）：${err?.message || err}`)
    }

    const view = buildAkashaView(profile, { translations })
    let chars = view.chars
    if (records.length) {
      chars = filterAkashaChars(chars, records)
      notices.push(chars.length
        ? `已按 ${args.names.join('、')} 筛选（命中 ${chars.length} 个）`
        : `akasha 上没有 ${args.names.join('、')} 的记录（该号收录 ${view.total} 个角色）`)
    }
    if (!chars.length) {
      await e.reply([notices.join('\n'), akashaText({ ...view, chars: [] }, TITLE)].filter(Boolean).join('\n'))
      return true
    }

    // miao 面板一屏一角色：取名次最好的那个（角色名命中时通常就一个）
    const target = chars[0]
    const builds = profile.builds || []
    const build = builds.find(b => String(b?.characterId) === String(target.id)) || null

    let painted = false
    if (!build) {
      notices.push('akasha 没有返回该角色的 build 数据（等级/天赋/武器），本次不出面板')
    } else {
      try {
        const miao = await loadMiao()
        if (miao) {
          const avatar = await buildAkashaAvatar(target.id, { ...build, uid })
          if (avatar) {
            const panelData = await toPanelData({
              uid,
              avatar,
              attr: akashaAttr(build.stats, miao.Format)
            })
            if (panelData) painted = await renderMiaoPanel(e, panelData)
          }
        }
      } catch (err) {
        logger?.error?.(`[Mhydps] miao 面板渲染失败：${err?.message || err}`)
      }
    }

    // 面板留空的圣遗物区必须说明原因（akasha 不提供副词条），不编数字
    const notes = [
      ...notices,
      '面板数据源：akasha.cv（名次/伤害为 akasha 口径，与本站 DPS 榜不同）',
      '圣遗物区留空：akasha 的接口只给主词条、不给副词条，故不渲染圣遗物卡与总分'
    ].filter(Boolean)

    if (painted) {
      await e.reply(notes.join('\n'))
      return true
    }

    await e.reply([notes.join('\n'), akashaText({ ...view, chars }, TITLE)].join('\n'))
    return true
  }
}

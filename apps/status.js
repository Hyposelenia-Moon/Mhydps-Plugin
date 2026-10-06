import plugin from '../../../lib/plugins/plugin.js'
import { getPluginConfig, getProxy } from '../components/config.js'
import { cacheInfo, getCounts } from '../model/TeamStore.js'
import { avatarStats } from '../model/AvatarStore.js'
import { versions } from '../model/CharacterIndex.js'
import { pluginVersion, yunzaiVersion, versionText } from '../components/pluginVersion.js'
import { COPYRIGHT, SITE_NAME, agoText, formatTime } from '../components/constants.js'
import { respond } from '../modules/respond.js'

const config = getPluginConfig()

/** `#DPS状态` */
const CMD_RE = /^#?(?:dps|DPS)状态$/

const TITLE = '#DPS状态'

export class MhydpsStatus extends plugin {
  constructor () {
    super({
      name: 'Mhydps状态',
      dsc: '#DPS状态',
      event: 'message',
      priority: config.priority ? config.priority - 10 : 7990,
      rule: [
        { reg: CMD_RE, fnc: 'handleStatus', permission: 'all' }
      ]
    })
  }

  /** 状态数据（图与文本回退共用一份） */
  buildData () {
    const info = cacheInfo()
    const counts = getCounts()
    const proxy = getProxy()
    const verList = versions()

    return {
      siteName: SITE_NAME,
      title: TITLE,
      hasData: counts.teams > 0,
      dataTime: info.fetchedAt ? formatTime(info.fetchedAt) : '尚未抓取',
      ageText: info.fetchedAt ? agoText(info.ageMs) : '—',
      ttlText: `${info.ttlMinutes} 分钟`,
      staleText: info.stale ? '已过期（下次查询会自动刷新）' : '有效',
      proxy: proxy || '',
      sources: [
        { name: 'DPS数据库', count: counts.teams },
        { name: '危战榜单', count: counts.teams2 }
      ],
      versions: `${verList.length} 个版本（${verList[verList.length - 1] || '-'} ~ ${verList[0] || '-'}）`,
      avatar: avatarStats(),
      pluginVersion,
      yunzaiVersion,
      versionText,
      copyright: COPYRIGHT
    }
  }

  /** #DPS状态 — 缓存时间、条数、头像缓存与版本信息 */
  async handleStatus (e) {
    const data = this.buildData()

    if (!data.hasData) {
      await e.reply(
        '[Mhydps] 还没有本地数据。\n'
        + '· 主人执行 #DPS更新 立即拉取\n'
        + '· 直接查询（#DPS榜 / #DPS危战榜）也会自动拉取\n'
        + `· 若拉取失败，检查配置里的 proxy（当前：${data.proxy || '未设置（直连）'}）`
      )
      return true
    }

    return await respond(e, 'status', data, () => this.textOf(data))
  }

  /** 文本回退 */
  textOf (data) {
    return [
      `${data.title}｜${SITE_NAME}`,
      `数据时间：${data.dataTime}（${data.ageText}）· 缓存有效期 ${data.ttlText} · ${data.staleText}`,
      ...data.sources.map(s => `· ${s.name}：${s.count} 条`),
      `· 危战版本：${data.versions}`,
      `· 立绘缓存：${data.avatar.cached}/${data.avatar.total} 张`,
      `· 代理：${data.proxy || '未设置（直连）'}`,
      `· ${versionText}`
    ].join('\n')
  }
}

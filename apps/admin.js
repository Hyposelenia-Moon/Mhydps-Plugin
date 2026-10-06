import plugin from '../../../lib/plugins/plugin.js'
import { getPluginConfig, getProxy } from '../components/config.js'
import { refresh } from '../model/TeamStore.js'
import { formatTime } from '../components/constants.js'

const config = getPluginConfig()

/** `#DPS更新` / `#DPS刷新` / `#DPS强制更新` */
const CMD_RE = /^#?(?:dps|DPS)(?:强制更新|更新|刷新)$/

export class MhydpsAdmin extends plugin {
  constructor () {
    super({
      name: 'Mhydps数据管理',
      dsc: '#DPS更新',
      event: 'message',
      priority: config.priority ? config.priority - 10 : 7990,
      rule: [
        { reg: CMD_RE, fnc: 'handleUpdate', permission: 'master' }
      ]
    })
  }

  /**
   * #DPS更新 — 手动刷新榜单缓存
   * 两个接口合计约 1 MB，走代理时通常 1~3 秒；成功后内存与磁盘缓存同时更新
   */
  async handleUpdate (e) {
    await e.reply('[Mhydps] 正在从 mhydps.cn 拉取榜单数据...', true)

    const ret = await refresh({ proxy: getProxy() })

    if (!ret.ok) {
      await e.reply(`[Mhydps] 更新失败：${ret.error}`, true)
      return true
    }

    const sec = (ret.ms / 1000).toFixed(1)
    await e.reply(
      `[Mhydps] 更新完成\n`
      + `DPS榜 ${ret.counts.teams} 条 · 危战榜 ${ret.counts.teams2} 条\n`
      + `耗时 ${sec}s · 数据时间 ${formatTime(ret.fetchedAt)}`,
      true
    )
    return true
  }
}

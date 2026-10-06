/**
 * startup — 插件启动编排
 *
 * index.js 载入时只做一件事：把磁盘缓存读进内存（**不发网络请求**）。
 * 原因：插件加载有超时限制，而拉全量榜单要打两个接口（合计约 1 MB，且国内需走代理）；
 * 查询路径由 TeamStore.ensureFresh() 按 TTL 惰性刷新，手动刷新走 `#DPS更新`。
 * 本模块只做编排、不含业务逻辑，依赖可注入，便于在没有数据的机器上测试
 * （见 test/startup-lifecycle.test.mjs）。
 */
import { loadFromDisk } from './TeamStore.js'

/**
 * 启动编排：载入磁盘缓存并打印状态
 * @param {object} [deps] - 依赖（供测试注入）
 * @param {Function} [deps.load] - 载入函数，默认 loadFromDisk
 * @param {object} [deps.log] - 日志对象，默认全局 logger
 * @returns {{ loaded: boolean, teams: number, teams2: number, fetchedAt: number }}
 */
export function initStore (deps = {}) {
  const { load = loadFromDisk, log = logger } = deps

  try {
    const ret = load()
    if (ret.teams || ret.teams2) {
      const time = ret.fetchedAt ? new Date(ret.fetchedAt).toLocaleString('zh-CN') : '未知'
      log?.info?.(`[Mhydps] 已载入本地缓存：DPS榜 ${ret.teams} 条 / 危战榜 ${ret.teams2} 条（抓取于 ${time}）`)
    } else {
      log?.info?.('[Mhydps] 暂无本地缓存，首次查询或 #DPS更新 时自动拉取')
    }
    return { loaded: true, ...ret }
  } catch (err) {
    // 缓存损坏不应阻断插件加载：查询路径会按「无数据」重新拉取
    log?.warn?.(`[Mhydps] 本地缓存载入失败：${err.message}`)
    return { loaded: false, teams: 0, teams2: 0, fetchedAt: 0 }
  }
}

/**
 * Enka 练度取数：地址拼装与错误翻译
 *
 * 站点练度接口是相对路径，而底层 `httpGet` 只接受绝对地址（内部直接 `new URL()`），
 * 少一步拼接就会在运行时抛 `Invalid URL`——这条曾在真机上发生，故单独钉住。
 * 本套件不联网：只验地址与错误分支，真实取数由人工验证。
 */
import { checker, installFrameworkStubs, mod, requireDeps } from './_helper.mjs'

installFrameworkStubs()
requireDeps('yaml')

const { enkaUrl, fetchPlayer, readPlayer, UID_RE } = await import(mod('model/EnkaClient.js'))
const { siteUrl } = await import(mod('model/MhydpsClient.js'))

const { check, finish } = checker()

// ---- 地址拼装 ----
check('练度地址是站点全地址', enkaUrl('100000000') === 'https://www.mhydps.cn/api/enka/uid/100000000', enkaUrl('100000000'))
check('相对路径会被补成站点全地址', siteUrl('/api/teams') === 'https://www.mhydps.cn/api/teams')
check('已是全地址时原样返回', siteUrl('https://example.com/x') === 'https://example.com/x')
check('地址可被 URL 解析', (() => {
  try {
    return new URL(enkaUrl('100000000')).pathname === '/api/enka/uid/100000000'
  } catch {
    return false
  }
})())

// ---- UID 校验 ----
check('UID 规则为 9 位数字', UID_RE.test('100000000') && !UID_RE.test('10000000') && !UID_RE.test('abcdefghi'))

let badUid = ''
try {
  await fetchPlayer('123')
} catch (err) {
  badUid = err.message
}
check('UID 非法时给出可读提示', badUid.includes('9 位数字'), badUid)

// ---- 连接失败不应该是「Invalid URL」 ----
let connErr = ''
try {
  // 指向一个几乎必然无人监听的本地端口：验证请求确实发到了代理，而不是死在地址拼装上
  await fetchPlayer('100000000', { proxy: 'http://127.0.0.1:9', timeoutMs: 3000 })
} catch (err) {
  connErr = err.message
}
check('请求失败原因是连接类而非 Invalid URL', connErr.length > 0 && !connErr.includes('Invalid URL'), connErr.slice(0, 120))

// ---- 玩家信息读取（离线样例） ----
const player = readPlayer({
  uid: '100000000',
  region: 'CN',
  playerInfo: { nickname: '丘丘', level: 20, worldLevel: 1 }
})
check('玩家字段映射', player.nickname === '丘丘' && player.level === 20 && player.region === 'CN')
check('缺字段时兜底', readPlayer({}).nickname === '未知玩家' && readPlayer({}).avatarCount === 0)

finish()

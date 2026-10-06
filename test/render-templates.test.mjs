/**
 * 渲染实测：5 个模板都要能在真实框架渲染后端里出图，且模板里的资源/头像路径必须能解析到文件
 *
 * 这条是「路径层级」的守门人：框架把 HTML 写到 `temp/html/Mhydps-Plugin/dps/<tpl>/<saveId>.html`，
 * `components/render.js` 里的 `../../../../../../` 少一层就会 CSS 全丢、头像全裂，但**渲染不会报错**。
 * 所以这里不只看出图，还把渲染产物里的 href/src 解析回磁盘核对。
 *
 * 缺前置（不在 bot 环境 / 没装浏览器 / 缺依赖）时打印「跳过」并以 0 退出。
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  checker,
  installFrameworkStubs,
  loadFixture,
  mod,
  pluginRoot,
  requireRenderEnv,
  appRoot,
  ensureTmpDir
} from './_helper.mjs'

installFrameworkStubs({ echoError: true })
requireRenderEnv()

// 渲染时模板按固定相对路径找 `plugins/Mhydps-Plugin/data/`，故本套件不改数据目录
delete process.env.MHYDPS_DATA_DIR

const { renderDps } = await import(mod('components/render.js'))
const { normalizeTeams, normalizeTeams2 } = await import(mod('model/TeamStore.js'))
const { buildRows } = await import(mod('modules/rankQuery.js'))
const { buildRows: buildRaidRows } = await import(mod('modules/raidQuery.js'))
const { buildCharView } = await import(mod('modules/buildQuery.js'))
const { readPlayer } = await import(mod('model/EnkaClient.js'))
const { cacheInfo, getCounts } = await import(mod('model/TeamStore.js'))
const { avatarStats } = await import(mod('model/AvatarStore.js'))
const { helpCfg, helpList } = await import(mod('resources/help/help-cfg.js'))
const { versions } = await import(mod('model/CharacterIndex.js'))
const { COPYRIGHT, SITE_NAME, formatTime, agoText } = await import(mod('components/constants.js'))
const { pluginVersion, yunzaiVersion, versionText } = await import(mod('components/pluginVersion.js'))

const { check, finish } = checker()

/** 1×1 webp：给模板一张真实存在的立绘，验证 _data_path 能解析到文件 */
const FAKE_AVATAR = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64')
const avatarDir = path.join(pluginRoot, 'data', 'avatar')
const avatarFile = path.join(avatarDir, '10000046.webp')
const hadAvatar = fs.existsSync(avatarFile)
if (!hadAvatar) {
  fs.mkdirSync(avatarDir, { recursive: true })
  fs.writeFileSync(avatarFile, FAKE_AVATAR)
}

const outDir = path.join(ensureTmpDir(), 'render')
fs.mkdirSync(outDir, { recursive: true })

/**
 * 渲染一次并落盘产物
 * @returns {Promise<{img: object|null, html: string, err: string}>}
 */
async function renderOnce (tpl, data, saveId) {
  try {
    const img = await renderDps(tpl, { ...data, saveId })
    const htmlPath = path.join(appRoot, 'temp', 'html', 'Mhydps-Plugin', 'dps', tpl, `${saveId}.html`)
    const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : ''
    if (html) fs.writeFileSync(path.join(outDir, `${tpl}.html`), html, 'utf8')
    // 出图对象里带 Buffer 时落一份 jpg，便于人工看排版
    const raw = img?.file ?? img?.data
    const buf = Buffer.isBuffer(raw)
      ? raw
      : (typeof raw === 'string' && raw.startsWith('data:') ? Buffer.from(raw.split(',')[1], 'base64') : null)
    if (buf) fs.writeFileSync(path.join(outDir, `${saveId}.jpg`), buf)
    else if (process.env.MHYDPS_DEBUG_RENDER) console.log(`  （${saveId} 图片形态：${typeof raw} keys=${img ? Object.keys(img).join(',') : 'null'}）`)
    return { img, html, err: '' }
  } catch (err) {
    return { img: null, html: '', err: err?.message || String(err) }
  }
}

/** 核对 HTML 里的相对引用是否都能落到真实文件 */
function checkRefs (html, htmlDir, label, refRe) {
  const refs = [...html.matchAll(refRe)].map(m => m[1])
  check(`${label}：模板内无残留未替换占位符`, !/\{\{|\}\}/.test(html))
  check(`${label}：引用了资源文件`, refs.length > 0, `${refs.length} 处`)
  const broken = refs.filter(ref => {
    if (/^(https?:|data:)/.test(ref)) return false
    const abs = path.resolve(htmlDir, ref.split('?')[0])
    return !fs.existsSync(abs)
  })
  check(`${label}：所有相对引用都能解析到文件`, broken.length === 0, broken.slice(0, 3).join(' | '))
  return refs
}

const teams = normalizeTeams(loadFixture('teams.sample.json'))
const raids = normalizeTeams2(loadFixture('teams2.sample.json'))
const enka = loadFixture('enka.sample.json')
const now = Date.now()

// ---- rank ----
const rankData = {
  siteName: SITE_NAME,
  title: '#DPS榜',
  subtitle: '玛薇卡 · 按期望DPS降序',
  fetchedAt: formatTime(now),
  total: teams.length,
  page: 1,
  totalPages: 1,
  pageSize: teams.length,
  rows: buildRows(teams, 1),
  copyright: COPYRIGHT
}
const rank = await renderOnce('rank', rankData, 'test-rank')
check('rank 出图成功', Boolean(rank.img), rank.err)
if (rank.html) {
  const refs = checkRefs(rank.html, path.dirname(path.join(appRoot, 'temp', 'html', 'Mhydps-Plugin', 'dps', 'rank', 'x.html')), 'rank', /(?:href|src)="([^"]+)"/g)
  check('rank：头像走 data/avatar 相对路径', refs.some(r => r.includes('data/avatar/10000046.webp')), refs.find(r => r.includes('avatar')) || '')
  check('rank：渲染了角色名', rank.html.includes('玛薇卡') && rank.html.includes('胡桃'))
  check('rank：渲染了伤害与金数', rank.html.includes('323.0 万') && rank.html.includes('48'))
  check('rank：渲染了名次', rank.html.includes('rank-badge') || rank.html.includes('rank'))
  check('rank：页脚带版权行', rank.html.includes('mhydps.cn'))
}

// ---- raid ----
const raidData = {
  siteName: SITE_NAME,
  title: '#DPS危战榜',
  subtitle: '版本 7.1 · 按金数升序',
  fetchedAt: formatTime(now),
  total: raids.length,
  page: 1,
  totalPages: 1,
  rows: buildRaidRows(raids, 1),
  copyright: COPYRIGHT
}
const raid = await renderOnce('raid', raidData, 'test-raid')
check('raid 出图成功', Boolean(raid.img), raid.err)
if (raid.html) {
  checkRefs(raid.html, path.dirname(path.join(appRoot, 'temp', 'html', 'Mhydps-Plugin', 'dps', 'raid', 'x.html')), 'raid', /(?:href|src)="([^"]+)"/g)
  check('raid：渲染了首领与版本', raid.html.includes('矮灵雕刻师') && raid.html.includes('7.1'))
  check('raid：渲染了耗时', raid.html.includes('>24<') && raid.html.includes('秒'))
}

// ---- build ----
const buildData = {
  siteName: SITE_NAME,
  title: '#DPS练度查询',
  player: readPlayer(enka),
  chars: enka.avatarInfoList.map(buildCharView),
  copyright: COPYRIGHT
}
const build = await renderOnce('build', buildData, 'test-build')
check('build 出图成功', Boolean(build.img), build.err)
if (build.html) {
  checkRefs(build.html, path.dirname(path.join(appRoot, 'temp', 'html', 'Mhydps-Plugin', 'dps', 'build', 'x.html')), 'build', /(?:href|src)="([^"]+)"/g)
  check('build：渲染了玩家与角色', build.html.includes('测试玩家') && build.html.includes('胡桃'))
  check('build：渲染了面板数值', build.html.includes('54.2%'))
  check('build：渲染了圣遗物', build.html.includes('魔女的炎之花'))
  check('build：渲染了武器', build.html.includes('护摩之杖'))
}

// ---- status ----
const statusData = {
  siteName: SITE_NAME,
  title: '#DPS状态',
  hasData: true,
  dataTime: formatTime(now),
  ageText: agoText(1000),
  ttlText: '30 分钟',
  staleText: '有效',
  proxy: 'http://127.0.0.1:7890',
  sources: [
    { name: 'DPS数据库', count: teams.length },
    { name: '危战榜单', count: raids.length }
  ],
  versions: `${versions().length} 个版本（5.7 ~ 7.1）`,
  avatar: avatarStats(),
  pluginVersion,
  yunzaiVersion,
  versionText,
  copyright: COPYRIGHT
}
const status = await renderOnce('status', statusData, 'test-status')
check('status 出图成功', Boolean(status.img), status.err)
if (status.html) {
  checkRefs(status.html, path.dirname(path.join(appRoot, 'temp', 'html', 'Mhydps-Plugin', 'dps', 'status', 'x.html')), 'status', /(?:href|src)="([^"]+)"/g)
  check('status：渲染了条数与代理', status.html.includes('DPS数据库') && status.html.includes('127.0.0.1:7890'))
}

// ---- help ----
const helpData = {
  siteName: SITE_NAME,
  helpCfg,
  helpGroup: helpList.map(g => ({ group: g.group, list: g.list })),
  copyright: COPYRIGHT
}
const help = await renderOnce('help', helpData, 'test-help')
check('help 出图成功', Boolean(help.img), help.err)
if (help.html) {
  checkRefs(help.html, path.dirname(path.join(appRoot, 'temp', 'html', 'Mhydps-Plugin', 'dps', 'help', 'x.html')), 'help', /(?:href|src)="([^"]+)"/g)
  check('help：渲染了指令条目', help.html.includes('#DPS榜') && help.html.includes('#DPS危战榜') && help.html.includes('#DPS练度查询'))
}

// ---- 渲染缩放：由配置注入模板（调用方传的值不生效，避免绕过配置） ----
const scaled = await renderOnce('rank', { ...rankData, renderScale: 2 }, 'test-rank-scale')
check('模板 body 上的 zoom 来自配置', /zoom:\s*1\.5/.test(scaled.html), scaled.html.match(/zoom:[^"]*/)?.[0] || scaled.err)

// ---- 产物落盘（便于人工看效果） ----
check('渲染产物已保存到 test/.test-tmp/render/', fs.readdirSync(outDir).length >= 5, fs.readdirSync(outDir).join(','))

// 清理：只删本次创建的假立绘，不动真实缓存
if (!hadAvatar) {
  try {
    fs.rmSync(avatarFile, { force: true })
  } catch { /* 忽略 */ }
}

finish()

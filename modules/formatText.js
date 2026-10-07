/**
 * formatText — 渲染失败时的纯文本回退
 *
 * 出图链路依赖浏览器（框架 puppeteer 后端），在没装浏览器的机器上会失败；
 * 此时用这里拼的文字版把同样的信息发出去，保证命令在降级环境下可用。
 */
import { COPYRIGHT, SITE_NAME, formatTime } from '../components/constants.js'
import { bigNumText } from './akashaQuery.js'

/** 榜单页脚（数据来源与抓取时间） */
function footer (result) {
  const stale = result.stale ? '（缓存已过期，本次刷新失败，展示的是旧数据）' : ''
  return `数据：${SITE_NAME} · 抓取于 ${formatTime(result.fetchedAt)}${stale}`
}

/** 成员一行文本：名字 + 命座 */
function charLine (chars) {
  return (chars || []).map(c => `${c.name}${c.cText ? `(${c.cText})` : ''}`).join(' / ')
}

/**
 * 徽章一行文本：站点标签 + 绿玩/满级
 *
 * 模板里绿玩/满级是按 `clean`/`lvl` 字段渲染的带配色徽章，不在 tags 里；
 * 文本版要一并体现，所以在这里补上。
 * @param {object} row
 * @returns {string} 形如「　[满级 宏]」，无徽章时返回空串
 */
function badgeList (row) {
  const badges = [...(row.tags || [])]
  if (row.clean) badges.push('绿玩')
  if (row.lvl) badges.push('满级')
  return badges
}

/** 徽章文本（含方括号，供榜单文本用） */
function badgeLine (row) {
  const badges = badgeList(row)
  return badges.length ? `　[${badges.join(' ')}]` : ''
}

/**
 * 单条记录文本（视频查询用）：名次 + 主数值 + 金数 + 阵容 + 标签 + 视频链接
 * @param {object} result - findRankEntry / findRaidEntry 的返回值
 * @param {'rank'|'raid'} kind
 * @returns {string}
 */
export function entryText (result, kind = 'rank') {
  const row = result.row
  const title = kind === 'raid' ? '#DPS危战榜' : '#DPS榜'
  const lines = [`${title} 第 ${result.rank} 名（当前条件下共 ${result.total} 条）`]

  if (kind === 'raid') {
    lines.push(`${row.speedText}　${row.cost}金（限${row.limitcost}/常${row.normalcost}）　${row.ver}｜${row.bossName}`)
  } else {
    lines.push(`${row.damageText}　${row.cost}金（限${row.limitcost}/常${row.normalcost}）`)
  }

  lines.push(`阵容：${charLine(row.chars)}`)

  const badges = badgeList(row)
  if (badges.length) lines.push(`标签：${badges.join(' ')}`)

  lines.push(row.video ? `视频：${row.video}` : '视频：这条记录没有留下视频链接')
  lines.push('', `数据：${SITE_NAME} · 抓取于 ${formatTime(result.fetchedAt)}`)
  return lines.join('\n')
}

/**
 * DPS 榜文本版
 * @param {object} result - queryRank 返回值
 * @param {string} [title]
 * @returns {string}
 */
export function rankText (result, title = '#DPS榜') {
  const lines = [
    `${title}${result.subtitle ? `｜${result.subtitle}` : ''}`,
    `共 ${result.total} 条 · 第 ${result.page}/${result.totalPages} 页`,
    ''
  ]
  for (const row of result.rows) {
    lines.push(`#${row.rank}　${row.damageText}　${row.cost}金（限${row.limitcost}/常${row.normalcost}）`)
    lines.push(`　　${charLine(row.chars)}${badgeLine(row)}`)
    if (row.video) lines.push(`　　${row.video}`)
  }
  if (!result.rows.length) lines.push('没有符合条件的记录')
  lines.push('', footer(result))
  return lines.join('\n')
}

/**
 * 危战榜文本版
 * @param {object} result - queryRaid 返回值
 * @param {string} [title]
 * @returns {string}
 */
export function raidText (result, title = '#DPS危战榜') {
  const lines = [
    `${title}${result.subtitle ? `｜${result.subtitle}` : ''}`,
    `共 ${result.total} 条 · 第 ${result.page}/${result.totalPages} 页`,
    ''
  ]
  for (const row of result.rows) {
    lines.push(`#${row.rank}　${row.speedText}　${row.cost}金（限${row.limitcost}/常${row.normalcost}）　${row.ver}｜${row.bossName}`)
    lines.push(`　　${charLine(row.chars)}${badgeLine(row)}`)
    if (row.video) lines.push(`　　${row.video}`)
  }
  if (!result.rows.length) lines.push('没有符合条件的记录')
  lines.push('', footer(result))
  return lines.join('\n')
}

/**
 * 练度查询文本版
 * @param {object} result - queryBuild 返回值
 * @param {string} [title]
 * @returns {string}
 */
export function buildText (result, title = '#DPS练度查询') {
  const p = result.player
  const lines = [
    `${title}｜${p.nickname}（UID ${p.uid}）`,
    `等级 ${p.level}　世界等级 ${p.worldLevel}　公开角色 ${result.total}${result.truncated ? `（仅展示前 ${result.chars.length} 个）` : ''}`,
    ''
  ]
  if (result.filtered) {
    lines.splice(1, 0, `筛选：命中 ${result.chars.length} 个角色`)
  }
  if (result.unknown?.length) lines.splice(1, 0, `未识别的参数：${result.unknown.join('、')}`)
  for (const c of result.chars) {
    lines.push(`【${c.name}】Lv.${c.level}　${c.elementCn}　${c.constellation}命　天赋 ${c.talentText || '-'}`)
    if (c.weapon) lines.push(`　武器：${c.weapon.name} Lv.${c.weapon.level} 精${c.weapon.refine}`)
    lines.push(`　面板：${c.stats.map(s => `${s.label} ${s.value}`).join('　')}`)
    if (c.artifacts.length) {
      lines.push(`　圣遗物（${c.artifacts.reduce((n, a) => n + a.substatCount, 0)} 条副词条）：`)
      for (const a of c.artifacts) {
        lines.push(`　　${a.slot} ${a.name} +${a.level}　${a.mainLabel} ${a.mainValue}`)
        if (a.substats.length) {
          lines.push(`　　　${a.substats.map(s => `${s.label} ${s.value}`).join('，')}`)
        }
      }
    }
    lines.push('')
  }
  if (!result.chars.length) {
    lines.push(result.filtered
      ? `该 UID 的公开角色里没有：${(result.unknown || []).join('、') || '指定角色'}（公开角色共 ${result.roster?.length || 0} 个）`
      : '该 UID 未公开角色详情（游戏内「角色详情」需设为公开）')
  }
  lines.push(`数据：Enka Network（经 ${SITE_NAME} 代理）`)
  return lines.join('\n')
}

/** 版权行（状态页/帮助页文本回退用） */
export const copyrightLine = COPYRIGHT

/**
 * 练度查询文本版（数据源：akasha.cv）
 *
 * 口径必须写在文本里：akasha 的名次/伤害是它自己的公式与赛道榜，与本站榜单的期望 DPS 无关。
 * @param {object} view - akashaQuery.buildAkashaView 的返回值
 * @param {string} [title]
 * @returns {string}
 */
export function akashaText (view, title = '#DPS练度查询') {
  const p = view.player
  const lines = [
    `${title}｜${p.nickname || '未知昵称'}（UID ${p.uid}）`,
    `冒险等阶 ${p.level}　成就 ${p.achievements}　深境 ${p.abyss.floor}-${p.abyss.chamber}（${p.abyss.stars}★）　剧诗 ${p.theater.stars}★` +
      (p.stygian.score ? `　幽境危战 ${p.stygian.score} 分（${p.stygian.seconds}s）` : ''),
    `公开角色 ${p.owned}　akasha 收录 ${view.total}${view.total > view.chars.length ? `（仅列前 ${view.chars.length} 个）` : ''}`,
    ''
  ]
  for (const c of view.chars) {
    const best = c.best
    const rank = best
      ? `${best.short || '主赛道'} ${best.topText}（${best.ranking}/${best.outOf}）· 伤害 ${bigNumText(best.result)}`
      : '暂无 akasha 计算'
    lines.push(`【${c.name}】${c.constellation}命　武器 ${c.weapon.name || '-'}${c.weapon.refinement ? ` 精${c.weapon.refinement}` : ''}`)
    lines.push(`　${rank}`)
    if (c.sets.length) lines.push(`　套装：${c.sets.map(s => `${s.name}×${s.count}`).join('，')}`)
    lines.push('')
  }
  if (!view.chars.length) lines.push('akasha 没有该 UID 的角色练度记录')
  lines.push(`数据：akasha.cv（排名与伤害为 akasha 口径，与本站 DPS 榜不同）`)
  return lines.join('\n')
}

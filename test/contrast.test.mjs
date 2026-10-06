/**
 * 对比度（WCAG 2.1 AA）+ 字号可读性：离线回归
 *
 * 这些断言不依赖 bot、也不读图片：全部从 `resources/common/base.css` 的令牌现算，
 * 因此任何一次调色只要把某处文字压到阈值以下就会直接报红。
 *   - 正文（<24px 或 <18.66px 粗体）要求 ≥ 4.5:1
 *   - 大字（≥24px，或 ≥18.66px 粗体）要求 ≥ 3:1
 * 插画背景上的文字另有「整页蒙版 + 文字区面板」两层面板兜底（见 base.css 的 --page-veil / --panel-veil），
 * 面板之上的等效底色接近纯白，故这里以白底/卡底作为基准背景校核，属偏保守的口径。
 */
import fs from 'node:fs'
import path from 'node:path'
import { checker, pluginRoot } from './_helper.mjs'

const { check, finish } = checker()

const css = fs.readFileSync(path.join(pluginRoot, 'resources', 'common', 'base.css'), 'utf8')

/** 取一个令牌的字面值 */
function token (name) {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))
  if (!m) throw new Error(`令牌 --${name} 不存在`)
  return m[1].trim()
}

/** #rrggbb / rgba(r, g, b, a) → [r,g,b,a] */
function parseColor (value) {
  const text = value.trim()
  const hex = text.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]
  }
  const rgba = text.match(/rgba?\(([^)]+)\)/i)
  if (rgba) {
    const parts = rgba[1].split(',').map(s => Number(s.trim()))
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1]
  }
  throw new Error(`无法解析颜色：${value}`)
}

/** 半透明色叠在不透明底上 */
function over (fg, bg) {
  const a = fg[3]
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1]
}

function srgb (c) {
  const v = c / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function relLum ([r, g, b]) {
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
}

function contrast (fg, bg) {
  const l1 = relLum(fg)
  const l2 = relLum(bg)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

const WHITE = [255, 255, 255, 1]
const byToken = (name) => parseColor(token(name))
const softOverWhite = (name) => over(byToken(name), WHITE)

/** 规格：标签 / 前景色 / 背景色 / 字号 / 是否粗体 */
const specs = [
  ['正文主色 --text', byToken('text'), WHITE, 20, false],
  ['次级文字 --text-2', byToken('text-2'), WHITE, 15, false],
  ['弱化文字 --muted', byToken('muted'), WHITE, 17, false],
  ['更弱文字 --muted-2', byToken('muted-2'), WHITE, 18, false],
  ['弱化文字 on 卡内底', byToken('muted'), byToken('card-2'), 16, false],
  ['强调蓝 --accent', byToken('accent'), WHITE, 18, true],
  ['强调紫 --accent-2', byToken('accent-2'), WHITE, 16, false],
  ['金色 --gold', byToken('gold'), WHITE, 19, true],
  ['绿色 --green', byToken('green'), WHITE, 16, false],
  ['红色 --red', byToken('red'), WHITE, 15, false],
  ['标签：蓝 on 蓝底', byToken('accent'), softOverWhite('accent-soft'), 16, false],
  ['标签：绿玩 on 绿底', byToken('green'), softOverWhite('green-soft'), 16, false],
  ['标签：满级 on 金底', byToken('gold'), softOverWhite('gold-soft'), 16, false],
  ['标签：版本 on 紫底', byToken('accent-2'), softOverWhite('purple-soft'), 16, false],
  ['视频标记 on 红底', byToken('red'), softOverWhite('red-soft'), 15, false],
  ['名次 1 文字 on 金渐起', byToken('rank-1-text'), byToken('rank-1-from'), 26, true],
  ['名次 1 文字 on 金渐止', byToken('rank-1-text'), byToken('rank-1-to'), 26, true],
  ['名次 2 文字 on 紫渐起', byToken('rank-2-text'), byToken('rank-2-from'), 26, true],
  ['名次 2 文字 on 紫渐止', byToken('rank-2-text'), byToken('rank-2-to'), 26, true],
  ['名次 3 文字 on 蓝渐起', byToken('rank-3-text'), byToken('rank-3-from'), 26, true],
  ['名次 3 文字 on 蓝渐止', byToken('rank-3-text'), byToken('rank-3-to'), 26, true],
  ['元素 火', byToken('elem-pyro'), WHITE, 14, false],
  ['元素 水', byToken('elem-hydro'), WHITE, 14, false],
  ['元素 风', byToken('elem-anemo'), WHITE, 14, false],
  ['元素 雷', byToken('elem-electro'), WHITE, 14, false],
  ['元素 草', byToken('elem-dendro'), WHITE, 14, false],
  ['元素 冰', byToken('elem-cryo'), WHITE, 14, false],
  ['元素 岩', byToken('elem-geo'), WHITE, 14, false]
]

let worst = { name: '', ratio: Infinity }
for (const [name, fg, bg, size, bold] of specs) {
  const ratio = contrast(fg, bg)
  const isLarge = size >= 24 || (bold && size >= 18.66)
  const need = isLarge ? 3.0 : 4.5
  if (ratio < worst.ratio) worst = { name, ratio }
  check(`${name}（${size}px${bold ? ' 粗' : ''}）≥ ${need}`, ratio >= need, `${ratio.toFixed(2)}:1`)
}

// 字号可读性：正文不小于 14px（渲染时再乘 renderScale，实际像素更大）
const sizes = [...css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]))
check('base.css 存在字号声明', sizes.length > 0, `${sizes.length} 处`)
check('base.css 最小字号 ≥ 14px', Math.min(...sizes) >= 14, `最小 ${Math.min(...sizes)}px`)

for (const file of ['components.css', 'rank.html', 'raid.html', 'build.html', 'status.html', 'help.html']) {
  const text = fs.readFileSync(path.join(pluginRoot, 'resources', file.includes('.css') ? 'common' : 'dps', file), 'utf8')
  const found = [...text.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)].map(m => Number(m[1]))
  if (!found.length) continue
  const min = Math.min(...found)
  check(`${file} 最小字号 ≥ 14px`, min >= 14, `最小 ${min}px`)
}

console.log(`\n最低对比度项：${worst.name} → ${worst.ratio.toFixed(2)}:1`)

finish()

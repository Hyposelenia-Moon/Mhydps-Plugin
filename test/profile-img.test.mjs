/**
 * 面板立绘图库：探测、稳定选图、缺失降级
 *
 * 面板本体（模板/图标/评分）由 miao-plugin 提供，本插件只负责「这块立绘用哪张」，
 * 所以这里只需要离线钉住图库探测与选图行为。
 */
import fs from 'node:fs'
import path from 'node:path'
import { checker, ensureTmpDir, pluginRoot } from './_helper.mjs'

const { check, finish } = checker()

const tmp = path.join(ensureTmpDir(), 'profile-img')
fs.rmSync(tmp, { recursive: true, force: true })

// ---- 自建假图库：normal-character/胡桃/{a,b}.webp + normal-character/琴.webp 单文件布局 ----
const gallery = path.join(tmp, 'gallery')
const hutaoDir = path.join(gallery, 'normal-character', '胡桃')
fs.mkdirSync(hutaoDir, { recursive: true })
fs.writeFileSync(path.join(hutaoDir, '胡桃_1_a.webp'), 'A')
fs.writeFileSync(path.join(hutaoDir, '胡桃_2_b.webp'), 'B')
fs.writeFileSync(path.join(gallery, 'normal-character', '琴.webp'), 'Q')
fs.writeFileSync(path.join(gallery, 'normal-character', 'ignore.txt'), 'not an image')

process.env.MHYDPS_PROFILE_IMG = gallery

const A = await import(`file://${path.join(pluginRoot, 'model', 'ProfileImg.js')}`)

check('探测到图库目录', A.profileImgDir() === path.resolve(gallery), A.profileImgDir())

const images = A.profileImagesOf('胡桃')
check('目录布局的立绘全部列出', images.length === 2, `${images.length} 张`)
check('非图片文件被忽略', images.every(p => p.endsWith('.webp')))
check('单文件布局（<角色名>.webp）也能找到', A.profileImagesOf('琴').length === 1)
check('未收录的角色返回空数组', A.profileImagesOf('不存在的角色').length === 0)

const first = A.pickProfileImage('胡桃', '10000046')
check('同一种子恒选同一张（不会每次刷新换图）', first === A.pickProfileImage('胡桃', '10000046'), path.basename(first))
check('不同种子会分到不同张（多张图时）', new Set(['1', '2', '3', '4', '5', '6', '7', '8']
  .map(s => A.pickProfileImage('胡桃', s))).size > 1)
check('选中的图确实在磁盘上', fs.existsSync(first))
check('没收录的角色返回空串（调用方退回 miao 官方立绘）', A.pickProfileImage('不存在的角色', '1') === '')

check('图库目录不存在时返回空串（不抛错）', (() => {
  const bak = process.env.MHYDPS_PROFILE_IMG
  process.env.MHYDPS_PROFILE_IMG = path.join(tmp, 'nope')
  const dir = A.profileImgDir()
  const pick = A.pickProfileImage('胡桃', '1')
  process.env.MHYDPS_PROFILE_IMG = bak
  return dir === '' && pick === ''
})())

finish()

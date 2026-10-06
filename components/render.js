import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from '../../../lib/puppeteer/puppeteer.js'
import { getRenderScale } from './config.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginRoot = path.resolve(__dirname, '..')

/** 插件目录名（渲染资源路径与模板路径都按这个名字拼） */
const PLUGIN_NAME = path.basename(pluginRoot)

/** 模板子目录（resources/<APP>/xxx.html） */
const APP = 'dps'

/**
 * 模板内资源路径前缀
 *
 * 框架把渲染 HTML 写到 `temp/html/<name>/<saveId>.html`，name 由本文件拼成
 * `Mhydps-Plugin/dps/<tpl>`，故生成的 HTML 位于 `temp/html/Mhydps-Plugin/dps/<tpl>/`，
 * 距 bot 根 5 级：<tpl> → dps → Mhydps-Plugin → html → temp → bot 根。
 * 路径不带结尾斜杠：模板里写的是 `{{_res_path}}/common/base.css`（带前导斜杠）。
 */
const RES_PREFIX = '../../../../../'
const resPath = `${RES_PREFIX}plugins/${PLUGIN_NAME}/resources`
const dataPath = `${RES_PREFIX}plugins/${PLUGIN_NAME}/data`

/**
 * 渲染 HTML 模板并截图
 * @param {string} tpl - 模板名（对应 resources/dps/<tpl>.html）
 * @param {object} data - 模板数据
 * @param {object} [opts] - 可选参数
 * @param {string} [opts.imgType] - 图片格式，默认 jpeg
 * @returns {Promise<object|false>} 成功返回 segment.image 对象，失败返回 false
 */
export async function renderDps (tpl, data = {}, opts = {}) {
  // 资源路径（模板内通过 _res_path / _data_path 引用 CSS 与缓存头像）
  data._res_path = resPath
  data._data_path = dataPath

  // 模板文件路径（框架按 cwd 解析，cwd 即 bot 根）
  data.tplFile = `./plugins/${PLUGIN_NAME}/resources/${APP}/${tpl}.html`

  // 缓存标识：唯一化避免并发渲染同模板时共享临时 HTML 文件互相覆盖
  data.saveId = data.saveId || `${tpl}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

  data.imgType = opts.imgType || 'jpeg'

  // 渲染缩放：模板 body 上的 CSS zoom（框架渲染后端不暴露 DPR 旋钮）
  data.renderScale = getRenderScale()

  const name = `${PLUGIN_NAME}/${APP}/${tpl}`
  return await puppeteer.screenshot(name, data)
}

export { resPath, dataPath, PLUGIN_NAME, APP }

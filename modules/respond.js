/**
 * respond — 统一的「出图，失败回退文本」回复
 *
 * 出图链路（框架 puppeteer 后端）在没装浏览器、渲染超时等情况下会失败；
 * 这里把 try/catch 与回退收敛到一处，apps 层只管准备数据。
 */
import { renderDps } from '../components/render.js'

/**
 * 渲染并回复；渲染失败时发文本
 * @param {object} e - 消息事件
 * @param {string} tpl - 模板名（resources/dps/<tpl>.html）
 * @param {object} data - 模板数据
 * @param {string|Function} fallback - 文本回退内容（函数则延迟求值）
 * @returns {Promise<boolean>} 恒为 true（已消费消息）
 */
export async function respond (e, tpl, data, fallback) {
  try {
    const img = await renderDps(tpl, data)
    if (img) {
      await e.reply(img)
      return true
    }
    logger?.warn?.(`[Mhydps] 模板 ${tpl} 渲染结果为空，改用文本回退`)
  } catch (err) {
    logger?.error?.(`[Mhydps] 模板 ${tpl} 渲染失败：${err?.message || err}`)
  }

  await e.reply(typeof fallback === 'function' ? fallback() : String(fallback ?? ''))
  return true
}

/**
 * 候选提示行（角色/首领没找到时给出相近项）
 * @param {string[]} [suggestions]
 * @returns {string}
 */
export function suggestLine (suggestions) {
  if (!Array.isArray(suggestions) || !suggestions.length) return ''
  return `\n你是不是想找：${suggestions.join('、')}`
}

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginRoot = path.resolve(__dirname, '..')

/**
 * bot 根目录：plugins/<PluginName>/components → 上溯两级
 * 在开发工作区（插件不在 bot 的 plugins/ 下）时该目录没有 package.json，版本回落 unknown
 */
const botRoot = path.resolve(pluginRoot, '../..')

/** 读一个 package.json 的字段，失败返回空串 */
function readField (dir, field) {
  try {
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return json?.[field] ? String(json[field]) : ''
  } catch {
    return ''
  }
}

/** 本插件版本（package.json version） */
export const pluginVersion = readField(pluginRoot, 'version') || 'unknown'

/** 框架版本（bot 根 package.json version） */
export const yunzaiVersion = readField(botRoot, 'version') || 'unknown'

/** 页脚统一文案 */
export const versionText = `Created By Yz-Bot ${yunzaiVersion} & Mhydps-Plugin ${pluginVersion}`

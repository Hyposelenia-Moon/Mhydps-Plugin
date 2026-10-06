import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pluginRoot = path.resolve(__dirname, '..')
const configDir = path.join(pluginRoot, 'config')

/**
 * 配置文件路径
 * `MHYDPS_CONFIG_FILE` 可指向别处：回归套件用它在临时目录里构造配置，
 * 避免为了测「配置越界时怎么处理」去改仓库里的 config/config.yaml
 */
const configFile = process.env.MHYDPS_CONFIG_FILE
  ? path.resolve(process.env.MHYDPS_CONFIG_FILE)
  : path.join(configDir, 'config.yaml')
const exampleFile = path.join(configDir, 'config.yaml.example')

/** 默认配置 */
const defaultConfig = {
  priority: 8000,
  renderScale: 1.5,
  proxy: '',
  cacheTtlMinutes: 30,
  pageSize: 10,
  timeoutMs: 30000,
  avatarEnabled: true,
  defaultUid: '',
  profileImgDir: '',
  miaoResDir: '',
  miaoPluginDir: ''
}

/**
 * 深合并默认配置与运行时配置（嵌套对象逐字段兜底）
 * @param {object} base - 默认配置
 * @param {object|null} overlay - 运行时配置
 * @returns {object}
 */
function deepMerge (base, overlay) {
  if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) {
    return { ...base }
  }
  const result = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)
      && base[key] !== null && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      result[key] = deepMerge(base[key], value)
    } else {
      result[key] = value
    }
  }
  return result
}

/**
 * 获取插件配置
 * config.yaml 不存在时从 .example 复制；.example 也不存在则返回默认值
 * @returns {object} 配置对象
 */
export function getPluginConfig () {
  if (fs.existsSync(configFile)) {
    try {
      return deepMerge(defaultConfig, YAML.parse(fs.readFileSync(configFile, 'utf8')))
    } catch (e) {
      logger?.warn('[Mhydps] 配置文件解析失败，使用默认配置')
      return { ...defaultConfig }
    }
  }
  if (fs.existsSync(exampleFile)) {
    fs.copyFileSync(exampleFile, configFile)
    logger?.info('[Mhydps] 已从 config.yaml.example 创建配置文件')
    try {
      return deepMerge(defaultConfig, YAML.parse(fs.readFileSync(configFile, 'utf8')))
    } catch (e) {
      return { ...defaultConfig }
    }
  }
  return { ...defaultConfig }
}

/**
 * 请求代理地址（空串 = 直连）
 *
 * mhydps.cn 与 GitHub 在国内网络下直连会被重置（TLS 握手 RST），实测需走本地代理
 * （如 http://<代理主机>:<端口>）。此处只做取值与修剪，不做合法性校验——
 * 非法地址会在 MhydpsClient 里报出具体的连接错误。
 * @returns {string}
 */
export function getProxy () {
  return String(getPluginConfig()?.proxy || '').trim()
}

/**
 * 渲染缩放取值范围与默认值（与锅巴「渲染缩放」字段一致）
 * @param {*} value - 配置里的原始值
 * @returns {number} 0.5 ~ 3
 */
export function clampRenderScale (value) {
  // null / undefined / 空串视为「没配」，回落默认值；Number(null) 是 0，不特判会被夹成 0.5
  if (value === null || value === undefined || value === '') return defaultConfig.renderScale
  const num = Number(value)
  if (!Number.isFinite(num)) return defaultConfig.renderScale
  return Math.min(3, Math.max(0.5, num))
}

/** 取当前配置的渲染缩放 */
export function getRenderScale () {
  return clampRenderScale(getPluginConfig()?.renderScale)
}

/** 单页条数（越界按默认值处理，上限 20） */
export function getPageSize () {
  const value = Number(getPluginConfig()?.pageSize)
  if (!Number.isFinite(value) || value < 1) return defaultConfig.pageSize
  return Math.min(20, Math.floor(value))
}

/** 缓存有效期（分钟，最小 1） */
export function getCacheTtlMinutes () {
  const value = Number(getPluginConfig()?.cacheTtlMinutes)
  if (!Number.isFinite(value) || value < 1) return defaultConfig.cacheTtlMinutes
  return Math.floor(value)
}

/** 单次请求超时（毫秒，范围 3s ~ 120s） */
export function getTimeoutMs () {
  const value = Number(getPluginConfig()?.timeoutMs)
  if (!Number.isFinite(value)) return defaultConfig.timeoutMs
  return Math.min(120000, Math.max(3000, Math.floor(value)))
}

export { pluginRoot, configDir, configFile, exampleFile, defaultConfig }

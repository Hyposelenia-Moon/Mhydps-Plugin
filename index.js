import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initStore } from './model/startup.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ---- 配置初始化 ----
const configDir = path.join(__dirname, 'config')
const configFile = path.join(configDir, 'config.yaml')
const exampleFile = path.join(configDir, 'config.yaml.example')

if (!fs.existsSync(configFile) && fs.existsSync(exampleFile)) {
  fs.mkdirSync(configDir, { recursive: true })
  fs.copyFileSync(exampleFile, configFile)
  logger?.info('[Mhydps] 已从 config.yaml.example 创建配置文件')
}

logger?.info('----Mhydps-Plugin----')
logger?.info('[Mhydps] 初始化中...')

// ---- 只载入磁盘缓存（不发网络请求，避免插件加载超时）----
// 数据拉取交给查询时的 TTL 惰性刷新与 #DPS更新，见 model/TeamStore.js
initStore()

// ---- 加载 apps ----
const appsDir = path.join(__dirname, 'apps')
const files = fs.readdirSync(appsDir).filter(f => f.endsWith('.js'))

const ret = await Promise.allSettled(
  files.map(f => import(`./apps/${f}`))
)

const apps = {}
for (let i = 0; i < files.length; i++) {
  const name = files[i].replace('.js', '')
  if (ret[i].status === 'fulfilled') {
    apps[name] = ret[i].value[Object.keys(ret[i].value)[0]]
    logger?.info(`[Mhydps] 载入: ${name}`)
  } else {
    logger?.error(`[Mhydps] 载入失败: ${logger?.red?.(name) || name}`)
    logger?.error(ret[i].reason)
  }
}

logger?.info('[Mhydps] 载入完成')
logger?.info('----Mhydps-Plugin----')

export { apps }

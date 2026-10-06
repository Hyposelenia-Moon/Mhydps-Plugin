/**
 * 套件公共设施：路径推导 / 前置检查 / 断言计数 / 框架全局桩
 *
 * 套件约定：
 * - **任意 cwd 可跑**：路径一律由本文件位置推导，不写裸相对字面量、不写盘符绝对路径
 * - **缺前置就跳过、不算失败**：没有依赖（yaml / https-proxy-agent）、没有 bot 环境
 *   （bot 根下缺 lib/puppeteer）、没有浏览器时，打印「跳过：原因」并 exit 0
 * - **不发真实网络请求**：数据类套件只用 test/fixtures/ 的离线样例
 * - **不改动仓库数据**：缓存类套件把 MHYDPS_DATA_DIR 指向 test/.test-tmp/ 下的临时目录
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

/** 套件目录 */
export const testDir = path.dirname(fileURLToPath(import.meta.url))
/** 插件根目录 */
export const pluginRoot = path.resolve(testDir, '..')
/** bot 根目录（插件在 plugins/ 下时为 <bot根>；在工作区里跑时该目录通常不是 bot） */
export const appRoot = path.resolve(pluginRoot, '../..')
/** 套件临时产物目录（gitignore） */
export const tmpDir = path.join(testDir, '.test-tmp')
/** 离线样例目录 */
export const fixturesDir = path.join(testDir, 'fixtures')

/** 生产代码的 file URL（避免写死盘符） */
export const mod = (relPath) => pathToFileURL(path.join(pluginRoot, relPath)).href

/** 确保临时目录存在并返回 */
export function ensureTmpDir () {
  fs.mkdirSync(tmpDir, { recursive: true })
  return tmpDir
}

// 切到 bot 根：渲染类套件依赖框架按 cwd 解析 `plugins/<插件>/resources/...` 与 `temp/html/`。
// 纯逻辑套件的路径全部由 import.meta.url 推导，不受影响；工作区里 appRoot 不是 bot，切换也无害。
try {
  process.chdir(appRoot)
} catch { /* 目录不可用时保持原 cwd */ }

/**
 * 默认把运行时数据与配置指向套件临时目录（仓库里的 data/ 与 config/config.yaml 不该被套件写到）。
 * 具体套件在自己的 import 之前重设这两个变量即可覆盖这里的默认值。
 */
process.env.MHYDPS_DATA_DIR = process.env.MHYDPS_DATA_DIR || path.join(tmpDir, 'data')
process.env.MHYDPS_CONFIG_FILE = process.env.MHYDPS_CONFIG_FILE || path.join(tmpDir, 'config.yaml')
fs.mkdirSync(path.dirname(process.env.MHYDPS_CONFIG_FILE), { recursive: true })
if (!fs.existsSync(process.env.MHYDPS_CONFIG_FILE)) {
  // getPluginConfig 在配置文件缺失时会从 .example 复制；这里先放一份，避免它去写别的目录
  const example = path.join(pluginRoot, 'config', 'config.yaml.example')
  if (fs.existsSync(example)) fs.copyFileSync(example, process.env.MHYDPS_CONFIG_FILE)
}

/** 读一个离线样例（JSON） */
export function loadFixture (name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'))
}

/**
 * 造一个独立的临时数据目录（缓存类套件用）
 * @param {string} name - 子目录名
 * @returns {string} 绝对路径
 */
export function tempDataDir (name) {
  const dir = path.join(ensureTmpDir(), name)
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/* ============================================================
 *  前置检查（缺则跳过）
 * ============================================================ */

/** 打印「跳过」并正常退出（不算失败） */
export function skip (reason) {
  console.log(`⏭ 跳过：${reason}`)
  process.exit(0)
}

/**
 * 依赖是否可解析（yaml / https-proxy-agent 由安装步骤提供）
 * @param {string} name - 包名
 * @returns {boolean}
 */
export function hasDependency (name) {
  const candidates = [
    path.join(pluginRoot, 'node_modules', name),
    path.join(appRoot, 'node_modules', name)
  ]
  return candidates.some(p => fs.existsSync(p))
}

/** 前置：外部依赖（本插件目前是 yaml） */
export function requireDeps (...names) {
  const missing = names.filter(n => !hasDependency(n))
  if (missing.length) {
    skip(`缺少依赖 ${missing.join('、')}（在插件目录执行 pnpm install，或把插件放进 bot 的 plugins/ 后安装）`)
  }
}

/** bot 环境是否具备渲染后端 */
export function hasBotRenderer () {
  return fs.existsSync(path.join(appRoot, 'lib', 'puppeteer', 'puppeteer.js'))
}

/** 找一个可用浏览器：返回路径或空串 */
export function findBrowser () {
  const candidates = [
    process.env.MHYDPS_TEST_BROWSER,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome'
  ].filter(Boolean)
  return candidates.find(p => {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  }) || ''
}

/** 前置：bot 渲染环境（渲染类套件用） */
export function requireRenderEnv () {
  if (!hasBotRenderer()) skip('不在 bot 环境中（插件根上两级没有 lib/puppeteer/puppeteer.js）')
  if (!fs.existsSync(path.join(appRoot, 'plugins', 'Mhydps-Plugin'))) {
    skip('插件未安装在 <bot根>/plugins/Mhydps-Plugin（渲染按该路径解析模板与资源）')
  }
  if (!findBrowser()) skip('找不到浏览器（可设 MHYDPS_TEST_BROWSER=<可执行文件路径>）')
  if (!hasDependency('yaml')) skip('缺少依赖 yaml')
}

/* ============================================================
 *  断言计数
 * ============================================================ */

/**
 * 建一个断言计数器
 * @returns {{check: Function, counts: Function, finish: Function}}
 */
export function checker () {
  let pass = 0
  let fail = 0
  return {
    check (name, ok, extra = '') {
      ok ? pass++ : fail++
      console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? `  ${extra}` : ''}`)
    },
    counts: () => ({ pass, fail }),
    /** 打印汇总并按失败数退出 */
    finish () {
      console.log(`\n结果：通过 ${pass} / 失败 ${fail}`)
      process.exit(fail === 0 ? 0 : 1)
    }
  }
}

/* ============================================================
 *  框架全局桩（logger / redis / cfg / segment）
 * ============================================================ */

/** 套件期间收集到的日志 */
export const logs = []

/**
 * 安装框架全局桩（生产代码依赖 bot 注入的 logger 等全局）
 * @param {object} [opts]
 * @param {boolean} [opts.collect] - 是否把日志收进 logs（默认 true，不打印）
 * @param {boolean} [opts.echoError] - 是否把 logger.error 打到 stderr
 */
export function installFrameworkStubs (opts = {}) {
  const { collect = true, echoError = false } = opts
  const record = (level) => (...args) => {
    if (collect) logs.push(args)
    if (echoError && level === 'error') console.error('[error]', ...args.map(a => (a && a.stack) || String(a)))
  }
  const paint = () => (v) => String(v ?? '')
  globalThis.logger = {
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
    mark: record('mark'),
    debug: record('debug'),
    green: paint(), red: paint(), cyan: paint(), yellow: paint(), blue: paint(),
    gray: paint(), magenta: paint(), white: paint(), bold: paint()
  }
  globalThis.redis = { get: async () => null, set: async () => {}, del: async () => {} }
  globalThis.cfg = { bot: {}, renderer: {} }
  // 与框架一致：segment.image(x) 包一层，出图对象里用 .file 携带图片数据
  globalThis.segment = { image: (data) => ({ type: 'image', file: data }) }
}

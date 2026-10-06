/**
 * guoba/index.js — 锅巴配置界面
 *
 * 对应 defSet/config.yaml 模板变量:
 *   mhydps_priority, mhydps_renderScale,
 *   mhydps_proxy, mhydps_timeoutMs,
 *   mhydps_cacheTtlMinutes, mhydps_pageSize, mhydps_avatarEnabled
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_DIR = path.join(__dirname, '..')
const DEFSET_CONFIG_PATH = path.join(PLUGIN_DIR, 'defSet', 'config.yaml')
const EXAMPLE_PATH = path.join(PLUGIN_DIR, 'config', 'config.yaml.example')

/**
 * 运行时配置路径
 * `MHYDPS_CONFIG_FILE` 可指向别处：回归套件用它在临时目录里验证「保存→读回」往返，
 * 不碰仓库里的 config/config.yaml
 */
const CONFIG_PATH = process.env.MHYDPS_CONFIG_FILE
  ? path.resolve(process.env.MHYDPS_CONFIG_FILE)
  : path.join(PLUGIN_DIR, 'config', 'config.yaml')

/** guoba field → defSet 模板变量名 */
const TEMPLATE_VARS = {
  priority: 'mhydps_priority',
  renderScale: 'mhydps_renderScale',
  proxy: 'mhydps_proxy',
  timeoutMs: 'mhydps_timeoutMs',
  cacheTtlMinutes: 'mhydps_cacheTtlMinutes',
  pageSize: 'mhydps_pageSize',
  avatarEnabled: 'mhydps_avatarEnabled'
}

/** 默认值（模板变量替换时的兜底） */
const DEFAULTS = {
  mhydps_priority: '8000',
  mhydps_renderScale: '1.5',
  mhydps_proxy: '',
  mhydps_timeoutMs: '30000',
  mhydps_cacheTtlMinutes: '30',
  mhydps_pageSize: '10',
  mhydps_avatarEnabled: 'true'
}

/**
 * 读取运行时配置
 * 优先级: config.yaml > config.yaml.example > 空对象
 */
function readConfig () {
  let file = null
  if (fs.existsSync(CONFIG_PATH)) {
    file = CONFIG_PATH
  } else if (fs.existsSync(EXAMPLE_PATH)) {
    file = EXAMPLE_PATH
  }
  if (!file) return {}
  try {
    return YAML.parse(fs.readFileSync(file, 'utf8')) || {}
  } catch (e) {
    logger?.error('[Mhydps][锅巴] 解析配置失败:', e)
    return {}
  }
}

export function supportGuoba () {
  return {
    pluginInfo: {
      name: 'Mhydps-Plugin',
      title: '原神DPS数据',
      author: '@Hyposelenia',
      authorLink: 'https://github.com/Hyposelenia-Moon',
      link: 'https://github.com/Hyposelenia-Moon/Mhydps-Plugin',
      isV3: true,
      isV2: false,
      description: '查询 mhydps.cn 的原神 DPS 数据库配队榜、危战榜与 Enka 练度',
      icon: 'mdi:chart-bar',
      iconColor: '#4a9eff'
    },
    configInfo: {
      schemas: [
        // ==================== 基础设置 ====================
        { label: '基础设置', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'priority',
          label: '优先级',
          helpMessage: '数字越小越先执行',
          bottomHelpMessage: '默认 8000，低于 Atlas-Plugin（10000），保证 #DPS… 命令先被本插件接管',
          component: 'InputNumber',
          required: true,
          componentProps: { min: -99999, max: 99999, defaultValue: 8000 }
        },
        {
          field: 'renderScale',
          label: '渲染缩放',
          helpMessage: 'HTML 渲染时的缩放比例',
          bottomHelpMessage: '默认 1.5，越大图片越清晰但渲染越慢',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 0.5, max: 3, step: 0.1, defaultValue: 1.5 }
        },

        // ==================== 网络 ====================
        { label: '网络', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'proxy',
          label: '请求代理',
          helpMessage: '抓取 mhydps.cn 使用的代理，留空 = 直连',
          bottomHelpMessage: '实测国内直连 www.mhydps.cn 会被重置（TLS 握手 RST），需要本地代理，如 http://127.0.0.1:7890',
          component: 'Input',
          required: false,
          componentProps: { placeholder: 'http://127.0.0.1:7890' }
        },
        {
          field: 'timeoutMs',
          label: '请求超时（毫秒）',
          helpMessage: '单次请求的最大等待时间',
          bottomHelpMessage: '默认 30000 = 30 秒。走代理较慢时可适当调大',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 3000, max: 120000, step: 1000, defaultValue: 30000 }
        },

        // ==================== 缓存 ====================
        { label: '缓存', component: 'SOFT_GROUP_BEGIN' },
        {
          field: 'cacheTtlMinutes',
          label: '缓存有效期（分钟）',
          helpMessage: '超过后下一次查询自动重新拉取',
          bottomHelpMessage: '默认 30 分钟。站点数据更新不频繁，调小会增加请求次数',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 1, max: 1440, defaultValue: 30 }
        },
        {
          field: 'pageSize',
          label: '每页条数',
          helpMessage: '榜单成图每页展示的记录数',
          bottomHelpMessage: '默认 10，上限 20（条数过多会让图片过长）',
          component: 'InputNumber',
          required: true,
          componentProps: { min: 1, max: 20, defaultValue: 10 }
        },
        {
          field: 'avatarEnabled',
          label: '缓存角色立绘',
          helpMessage: '是否下载并缓存榜单角色立绘',
          bottomHelpMessage: '默认开启。关闭后成图里以角色名文字占位（不再请求站点图片）',
          component: 'Switch',
          required: true,
          componentProps: { defaultValue: true }
        }
      ],

      getConfigData () {
        const cfg = readConfig()
        return {
          priority: cfg.priority ?? 8000,
          renderScale: cfg.renderScale ?? 1.5,
          proxy: cfg.proxy ?? '',
          timeoutMs: cfg.timeoutMs ?? 30000,
          cacheTtlMinutes: cfg.cacheTtlMinutes ?? 30,
          pageSize: cfg.pageSize ?? 10,
          avatarEnabled: cfg.avatarEnabled ?? true
        }
      },

      async setConfigData (data, { Result }) {
        try {
          if (!fs.existsSync(DEFSET_CONFIG_PATH)) {
            return Result.error('模板文件 defSet/config.yaml 不存在')
          }
          let template = fs.readFileSync(DEFSET_CONFIG_PATH, 'utf8')

          for (const [field, varName] of Object.entries(TEMPLATE_VARS)) {
            let value = data[field]
            if (value === undefined || value === null || value === '') {
              value = DEFAULTS[varName] ?? ''
            }
            template = template.replace(new RegExp(`\\$\\{${varName}\\}`, 'g'), String(value))
          }

          const configDir = path.join(PLUGIN_DIR, 'config')
          if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
          fs.writeFileSync(CONFIG_PATH, template, 'utf8')

          return Result.ok({}, '保存成功~')
        } catch (err) {
          logger?.error('[Mhydps][锅巴] 保存配置失败:', err)
          return Result.error(`保存失败：${err.message}`)
        }
      }
    }
  }
}

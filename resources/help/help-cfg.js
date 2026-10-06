/**
 * Mhydps-Plugin 帮助配置
 * 修改此文件后无需重启 bot（apps/help.js 使用动态 import 热重载）
 */

export const helpCfg = {
  title: '#DPS帮助',
  subTitle: 'Mhydps-Plugin 原神 DPS 数据查询'
}

export const helpList = [
  {
    group: '榜单查询',
    list: [
      { title: '#DPS榜', desc: 'DPS 数据库配队榜：按期望 DPS 降序，默认第 1 页' },
      { title: '#DPS榜 <角色>', desc: '只看含该角色的配队（支持别名，如 火神 / 龟 / 爷）' },
      { title: '#DPS榜 <角色> 主C', desc: '限定该角色是阵容主 C（配队第一位）' },
      { title: '#DPS榜 金≤12', desc: '按总金数筛选，支持 12金 / 金12 / 金≥8 / 8-12金' },
      { title: '#DPS榜 <角色> 绿玩', desc: '只看绿玩记录（无宏 / 无连点）；`标签:宏` 可反向筛宏' },
      { title: '#DPS榜 -p2', desc: '翻页，等价写法：第2页 / 页:2' },
      { title: '#DPS危战榜', desc: '危战榜单：默认按金数升序、同金数比耗时' },
      { title: '#DPS危战榜 7.1', desc: '按版本筛选（5.7 ~ 当前）' },
      { title: '#DPS危战榜 矮灵雕刻师', desc: '按首领筛选，支持首领名模糊匹配' },
      { title: '#DPS危战榜 <角色> 金≤4', desc: '版本 / 首领 / 角色 / 金数可任意组合' }
    ]
  },
  {
    group: '练度查询',
    list: [
      { title: '#DPS练度查询 <9位UID>', desc: '角色等级/命座/天赋/武器/圣遗物（Enka 数据）' },
      { title: '#练度查询 <9位UID>', desc: '同上，省略 DPS 前缀' }
    ]
  },
  {
    group: '插件信息',
    list: [
      { title: '#DPS状态', desc: '缓存时间、数据条数、立绘缓存与代理配置' },
      { title: '#DPS帮助', desc: '显示本帮助页' }
    ]
  },
  {
    group: '数据管理（仅主人）',
    auth: 'master',
    list: [
      { title: '#DPS更新', desc: '立即从 mhydps.cn 拉取全量榜单数据并刷新缓存' }
    ]
  }
]

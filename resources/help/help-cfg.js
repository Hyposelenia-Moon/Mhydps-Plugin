/**
 * Mhydps-Plugin 帮助配置
 * 修改此文件后无需重启 bot（apps/help.js 使用动态 import 热重载）
 *
 * 结构说明：
 *   helpCfg      —— 页头标题与副标题
 *   quickStart   —— 顶部「快速上手」卡：常用命令 + 参数速查
 *   helpList     —— 分组指令；每条可选 syntax（语法模板）/ args（参数表）/ examples（示例）
 *                  只有 title/desc 时渲染成单行条目（用于状态、帮助这类无参数的指令）
 */

export const helpCfg = {
  title: '#DPS帮助',
  subTitle: 'Mhydps-Plugin 原神 DPS 数据查询'
}

/** 快速上手：四条最常用命令 + 三个参数速查 */
export const quickStart = {
  title: '快速上手',
  commands: [
    { title: '#DPS榜', desc: 'DPS 配队总榜' },
    { title: '#DPS榜 胡桃 12金', desc: '某角色的低金配队' },
    { title: '#DPS危战榜 7.1', desc: '本期危战榜单' },
    { title: '#DPS练度查询 <UID>', desc: '查账号练度' }
  ],
  notes: [
    { label: '金数筛选', text: '12金 / 金12 / 金≤12 / 金≥8 / 8-12金' },
    { label: '翻页', text: '-p2 / 第2页 / 页:2' },
    { label: '修饰词', text: '主C（只看阵容第一位）、绿玩（无宏无连点）、标签:宏' }
  ]
}

export const helpList = [
  {
    group: '榜单查询',
    list: [
      {
        title: '#DPS榜',
        desc: 'DPS 数据库配队榜：按期望 DPS 降序，默认每页 10 条',
        syntax: '#DPS榜 [角色] [金数] [主C] [绿玩] [标签:xx] [第N页]',
        args: [
          { name: '角色', value: '角色名或别名', desc: '如 胡桃 / 火神（玛薇卡）/ 龟（神里绫华）/ 爷（旅行者）；不加则看总榜' },
          { name: '金数', value: '12金 / 金12 / 金≤12 / 金≥8 / 8-12金', desc: '按总金数筛选（总金 = 限定金 + 常驻金）' },
          { name: '主C', value: '主C', desc: '只匹配配队第一位，用于找以该角色为核心的阵容' },
          { name: '绿玩', value: '绿玩', desc: '只看无宏、无连点的记录' },
          { name: '标签', value: '标签:宏 / 标签:总伤杯', desc: '按站点标签筛选，可为赛事名；多个标签用空格分隔表示同时命中' },
          { name: '页N', value: '-p2 / 第2页 / 页:2', desc: '翻页；页码越界会自动收敛到最后一页' }
        ],
        examples: ['#DPS榜', '#DPS榜 胡桃', '#DPS榜 火神 12金 主C', '#DPS榜 胡桃 绿玩 -p2']
      },
      {
        title: '#DPS危战榜',
        desc: '危战榜单：默认按金数升序、同金数比耗时（站点口径）',
        syntax: '#DPS危战榜 [版本] [首领] [角色] [金数] [第N页]',
        args: [
          { name: '版本', value: '7.1 / 6.2 …', desc: '按版本筛选，可选范围 5.7 ~ 当前' },
          { name: '首领', value: '首领名（可只写简称）', desc: '如 矮灵雕刻师 / 重拳出击鸭 / 深黯魇语之主' },
          { name: '角色', value: '角色名或别名', desc: '只看包含该角色的记录' },
          { name: '金数', value: '金≤4 / 4金 / 金≥8', desc: '按总金数筛选，低金成绩常用 金≤4' },
          { name: '页N', value: '-p2 / 第2页 / 页:2', desc: '翻页' }
        ],
        examples: ['#DPS危战榜', '#DPS危战榜 7.1', '#DPS危战榜 矮灵雕刻师 金≤4', '#DPS危战榜 玛薇卡']
      }
    ]
  },
  {
    group: '练度查询',
    list: [
      {
        title: '#DPS练度查询',
        desc: '角色等级、命座、天赋、武器与圣遗物明细（Enka 数据，经站点代理）',
        syntax: '#DPS练度查询 <9位UID>',
        args: [
          { name: 'UID', value: '9 位数字', desc: '需在游戏内把「角色详情」设为公开，否则只能看到昵称与等级' }
        ],
        examples: ['#DPS练度查询 100000000', '#练度查询 100000000']
      },
      {
        title: '#练度查询',
        desc: '上一条的简写，可省略 DPS 前缀',
        examples: ['#练度查询 100000000']
      }
    ]
  },
  {
    group: '插件信息',
    list: [
      { title: '#DPS状态', desc: '缓存时间与有效期、两个数据源条数、立绘缓存数、当前代理配置' },
      { title: '#DPS帮助', desc: '显示本帮助页' }
    ]
  },
  {
    group: '数据管理（仅主人）',
    auth: 'master',
    list: [
      {
        title: '#DPS更新',
        desc: '立即从 mhydps.cn 拉取全量榜单数据并刷新缓存（缓存过期时查询也会自动刷新）',
        examples: ['#DPS更新']
      }
    ]
  }
]

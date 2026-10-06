/**
 * Mhydps-Plugin 帮助配置
 * 修改此文件后无需重启 bot（apps/help.js 使用动态 import 热重载）
 *
 * 结构约定（帮助图是「分组标题条 + 三列网格」的紧凑版式）：
 *   helpCfg  —— 页头标题与副标题
 *   helpList —— 分组；每组 list 里每项只有 title / desc 两个字段
 *               title 写成「命令 + 用法」的可直接照抄形态（如 `#DPS榜 金≤12`），
 *               desc 压成一行说明；不再有语法块 / 参数表 / 示例块
 */

export const helpCfg = {
  title: '#DPS帮助',
  subTitle: 'Mhydps-Plugin 原神 DPS 数据查询'
}

export const helpList = [
  {
    group: '榜单查询',
    list: [
      { title: '#DPS榜', desc: 'DPS 配队总榜（按期望 DPS 降序）' },
      { title: '#DPS榜 <角色>', desc: '只看含该角色的配队，支持别名（火神 / 龟 / 爷）' },
      { title: '#DPS榜 <角色> 主C', desc: '限定该角色为阵容主 C（配队第一位）' },
      { title: '#DPS榜 金≤12', desc: '按总金数筛选：12金 / 金12 / 金≥8 / 8-12金' },
      { title: '#DPS榜 绿玩', desc: '只看无宏、无连点的记录' },
      { title: '#DPS榜 标签:宏', desc: '按站点标签筛，可为赛事名（如 总伤杯S3）' },
      { title: '#DPS榜 -p2', desc: '翻页：-p2 / 第2页 / 页:2' },
      { title: '#DPS榜视频 3', desc: '发第 3 名的 B 站视频链接（可带上面的筛选）' }
    ]
  },
  {
    group: '危战榜单',
    list: [
      { title: '#DPS危战榜', desc: '危战榜：金数升序，同金数比耗时' },
      { title: '#DPS危战榜 7.1', desc: '按版本筛选（5.7 ~ 当前）' },
      { title: '#DPS危战榜 <首领>', desc: '按首领筛，可只写简称（如 矮灵雕刻师）' },
      { title: '#DPS危战榜 <角色>', desc: '只看含该角色的记录' },
      { title: '#DPS危战榜 金≤4', desc: '低金成绩常用写法' },
      { title: '#DPS危战榜视频 3', desc: '发第 3 名的 B 站视频链接' }
    ]
  },
  {
    group: '练度查询',
    list: [
      { title: '#DPS练度查询 <UID>', desc: '角色面板与圣遗物明细（Enka 数据）' },
      { title: '#练度查询 <UID>', desc: '简写，可省略 DPS 前缀' }
    ]
  },
  {
    group: '插件信息',
    list: [
      { title: '#DPS帮助', desc: '显示本帮助页' },
      { title: '#DPS状态', desc: '缓存时间、数据条数、立绘缓存与代理' }
    ]
  },
  {
    group: '数据管理（仅主人）',
    auth: 'master',
    list: [
      { title: '#DPS更新', desc: '立即拉取全量榜单并刷新缓存' }
    ]
  }
]

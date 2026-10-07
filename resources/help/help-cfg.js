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
      { title: '#DPS榜', desc: 'DPS 配队总榜；「榜」字可省，如 #DPS' },
      { title: '#DPS榜 胡桃', desc: '只看含该角色的配队，支持别名（火神 / 桃 / 爷）' },
      { title: '#DPS榜 金≤12', desc: '金数筛选：金≥8 / 8-12金 亦可；可加 主C / 绿玩 / -p2' }
    ]
  },
  {
    group: '危战榜单',
    list: [
      { title: '#DPS危战榜', desc: '幽境危战收录：金数升序，同金数比耗时' },
      { title: '#DPS危战榜 7.1', desc: '按版本或首领筛（首领可只写简称，如 矮灵雕刻师）' }
    ]
  },
  {
    group: '练度查询',
    list: [
      { title: '#DPS练度查询 <UID>', desc: 'akasha 练度面板（名次 / top% / 伤害 / 武器）' },
      { title: '#DPS练度查询 胡桃', desc: '只看指定角色；UID 取配置 defaultUid' }
    ]
  },
  {
    group: '其它',
    list: [
      { title: '#DPS视频 3', desc: '发第 3 名的 B 站视频；危战榜用 #DPS危战视频 3' },
      { title: '#DPS状态', desc: '两份数据源的缓存时间、条数与代理' },
      { title: '#DPS帮助', desc: '显示本页' },
      { title: '#DPS更新', desc: '立即刷新榜单缓存（仅主人）' }
    ]
  }
]

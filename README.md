# Mhydps-Plugin / 原神DPS数据

TRSS-Yunzai v3 插件：从 [mhydps.cn](https://www.mhydps.cn/)（原神 DPS 数据库）拉取**配队榜单**与**危战榜单**，并通过站点代理的 Enka 数据提供**练度查询**。

- 榜单数据：站点 `/api/teams`、`/api/teams2`（全量 JSON，本地缓存 + TTL 过期自动刷新）
- 练度数据：站点 `/api/enka/uid/<uid>`（站点代理的 Enka Network 数据）
- 角色名/别名、立绘 id、危战首领表：随插件分发（`resources/data/`，来源是站点前端内嵌静态表）

> 站点接口没有公开文档，属**非官方接口**；站点改版时插件可能失效，届时更新 `resources/data/` 与 `model/MhydpsClient.js` 即可（见「数据表维护」）。

## 安装

在 Yunzai 根目录执行：

```bash
git clone --depth=1 https://github.com/Hyposelenia-Moon/Mhydps-Plugin.git ./plugins/Mhydps-Plugin/
pnpm install --filter=Mhydps-Plugin
```

依赖只有 `yaml`（读配置）与 `https-proxy-agent`（走代理拉数据）。

**代理是必须配置的**：实测国内网络直连 `www.mhydps.cn` 会在 TLS 握手阶段被重置（`curl: (35) Recv failure: Connection was reset`），需在配置里填本地代理：

```yaml
proxy: 'http://127.0.0.1:7890'
```

首次使用可以直接发查询命令（会自动拉取），也可以由主人执行 `#DPS更新` 立即拉取。

## 命令一览

| 命令 | 说明 |
|------|------|
| `#DPS榜` | DPS 数据库配队榜，按期望 DPS 降序 |
| `#DPS榜 <角色>` | 只看含该角色的配队（支持站点别名：`火神`、`龟`、`爷`…） |
| `#DPS榜 <角色> 主C` | 限定该角色为阵容主 C（配队第一位） |
| `#DPS榜 金≤12` | 金数筛选：`12金` / `金12` / `金≥8` / `8-12金` |
| `#DPS榜 <角色> 绿玩` | 只看绿玩记录（无宏/无连点）；`标签:宏` 可反向筛宏 |
| `#DPS榜 -p2` | 翻页：`-p2` / `第2页` / `页:2` |
| `#DPS危战榜` | 危战榜单，默认按金数升序、同金数比耗时（站点默认口径） |
| `#DPS危战榜 7.1` | 按版本筛选（5.7 ~ 当前） |
| `#DPS危战榜 矮灵雕刻师` | 按首领筛选（名称模糊匹配） |
| `#DPS危战榜 玛薇卡 金≤4 -p2` | 版本/首领/角色/金数/翻页可任意组合 |
| `#DPS练度查询 <9位UID>` | 角色等级、命座、天赋、武器与圣遗物明细（Enka） |
| `#练度查询 <9位UID>` | 同上，省略 `DPS` 前缀 |
| `#DPS状态` | 缓存时间、数据条数、立绘缓存、当前代理 |
| `#DPS帮助` | 帮助图 |
| `#DPS更新` | 立即拉取全量榜单数据（**仅主人**） |

命令前缀大小写不敏感（`#dps榜` 亦可）。所有命令都会出图，渲染失败时自动回退为等价的纯文本。

## 配置

锅巴面板（`#锅巴配置` → 原神DPS数据）与 `config/config.yaml` 等价；首次启动会从 `config/config.yaml.example` 复制一份。

| 键 | 默认 | 说明 |
|----|------|------|
| `priority` | 8000 | 数字越小越先执行。必须低于 Atlas-Plugin 的 10000，`#DPS…` 才能先被本插件接管 |
| `renderScale` | 1.5 | 出图缩放（0.5 ~ 3） |
| `proxy` | 空 | 拉取 mhydps.cn 的代理，留空 = 直连（国内直连会失败） |
| `timeoutMs` | 30000 | 单次请求超时 |
| `cacheTtlMinutes` | 30 | 榜单缓存有效期，过期后下次查询自动重拉 |
| `pageSize` | 10 | 每页条数（≤20） |
| `avatarEnabled` | true | 是否缓存并渲染角色立绘，关闭后以角色名文字占位 |

## 数据来源与口径

| 展示项 | 站点字段 | 口径说明 |
|--------|----------|----------|
| 伤害 | `damage` | 站点收录的期望 DPS，榜默认按其降序 |
| 金数 | `cost` / `limitcost` / `normalcost` | `cost = limitcost + normalcost`（实测 teams 1394/1394、teams2 594/594 全部成立）：总金 = 限定金 + 常驻金 |
| 命座 | `members[].constellation` | 直接取站点字段 |
| 绿玩 | `clean` | 站点语义：无宏/无连点的记录 |
| 满级 | `lvl` | 全员满级记录 |
| 标签 | `tags` | 站点标签（`宏`、`总伤杯S3.N`、`星超导`…）原样展示 |
| 耗时 | `teams2.speed` | 危战通关耗时（秒） |
| 版本 / 首领 | `teams2.ver` / `teams2.boss` | 首领名来自随插件分发的 `bosses.json` |

**已知与站点前端的差异**（如实说明，不掩盖）：

1. 站点前端还会按「砺行修远送的命座算不算金」「常驻角色是否扣金」在**界面上**二次调整金数，并有一个 `cost<16` 时的 +1 规则。本插件只展示站点存储的三个原始字段（总/限定/常驻），不复刻这套前端调整。
2. 站点「练度查询」自带一套**专有评分**（按角色配置有效词条再加权，见站点前端 bundle）。本插件不复刻评分，只给出面板（生命/攻击/防御/精通/双暴/充能）、武器、5 件圣遗物主副词条与副词条条数。
3. 天赋等级按 Enka `skillLevelMap` 键末位（1/2/3 = 普攻/战技/爆发）取每个位次键最小的一套，多形态角色可能与站点展示略有出入。

## 数据表维护

`resources/data/characters.json`（123 条）与 `bosses.json`（36 条）是从站点前端 bundle 里提取的静态表，站点新增角色/新一期危战首领时需要更新：

1. 取站点首页，找到 `<script type="module" src="/assets/index-*.js">`，下载该 bundle；
2. 角色表是 bundle 里唯一的 `JSON.parse('[{"name":...,"alias":[...],"rarity":...,"element":...,"character_id":...}]')` 字面量；
3. 首领表是 `{id:713,name:"游雪的护刃",ver:"7.1"}` 形式的对象序列；
4. 覆盖 `resources/data/characters.json`、`resources/data/bosses.json` 后重启 bot（这两张表在进程内做了惰性缓存）。

## 目录结构

```
Mhydps-Plugin/
├── index.js                 入口：初始化配置、载入磁盘缓存、动态加载 apps/
├── apps/                    命令入口（rank / raid / build / admin / status / help）
├── model/                   数据层：HTTP 客户端、榜单缓存、角色索引、Enka、立绘缓存
├── modules/                 业务层：参数解析、榜单查询、练度组装、文本回退
├── components/              配置、常量、版本号、渲染
├── guoba/ + guoba.support.js 锅巴配置面板
├── defSet/ + config/        配置三层
├── resources/               模板、样式、帮助配置、随包数据表
└── test/                    回归套件（不启动 bot）
```

## 测试

```bash
node test/run.mjs                 # 全部
node test/run.mjs --filter=rank   # 只跑文件名含 rank 的
node test/run.mjs --list          # 只列清单
pnpm test                         # 等价于 node test/run.mjs
```

套件不启动 bot、不走网络：数据相关用例用 `test/fixtures/` 里的离线样例；缺前置（如浏览器）时打印「跳过」并以 0 退出。详见 `test/README.md`。

## 免责声明

- 数据版权归 [mhydps.cn](https://www.mhydps.cn/) 与投稿者所有，本插件只做只读查询与本地缓存。
- 站点接口非官方公开接口，若站点调整或关闭，本插件对应功能会失效。
- 请控制请求频率：默认 30 分钟缓存，正常使用下对站点压力极小；不建议把 `cacheTtlMinutes` 调得过小。

## License

GPL-3.0-only

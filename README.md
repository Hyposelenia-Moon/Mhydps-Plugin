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

**代理是必须配置的**：实测国内网络直连 `www.mhydps.cn` 会在 TLS 握手阶段被重置（`curl: (35) Recv failure: Connection was reset`），需在配置里填本地代理（地址与端口按你自己的代理软件填）：

```yaml
proxy: 'http://<代理主机>:<端口>'
```

首次使用可以直接发查询命令（会自动拉取），也可以由主人执行 `#DPS更新` 立即拉取。

## 数据源

本插件有两个**互不相通**的数据源，口径不同、图上也分别标注，不要互相解释：

| | 数据源一 · mhydps.cn | 数据源二 · akasha.cv |
|---|---|---|
| 用途 | `#DPS榜` / `#DPS危战榜`（**已实现**） | `#DPS练度查询`（**接口层已就绪，命令待接**） |
| 主体 | 匿名**配队记录**（1394 条，无 UID） | 按 **UID** 记录的角色练度 |
| 关键数值 | 期望 DPS、金数、危战耗时 | 角色**名次** `ranking/outOf`（→ top%）、akasha 自己的伤害公式结果、幽境危战分 |
| 取数方式 | 直连 HTTP（需配 `proxy`，国内直连会被 RST） | 直连 HTTP **会被 Cloudflare 挡**（403 挑战页），需浏览器会话 |
| 锅巴分组 | `数据源一 · mhydps.cn（DPS榜 / 危战榜）` | `数据源二 · akasha.cv（练度查询）` |

> 「查榜上人的练度」在两站数据上都做不到：mhydps 的榜单记录**没有 UID**（实测 1394 条里 0 条含 UID，
> `info` 只是备注文本），akasha 的名字/武器/套装名默认是英文、且不与 mhydps 的匿名记录互相索引。
> 想真正打通，只能请 mhydps 在收录记录里带上投稿者 UID。

### 数据源二（akasha）接口层现状

- 已实现：`model/AkashaClient.js`（端点拼装、取数注入、错误映射、`data/akasha/<uid>.json` 缓存）与
  `modules/akashaQuery.js`（解析 → 账号画像 + 每角色名次/top%/伤害/武器/套装，支持按角色别名筛选），
  另有 `formatText.akashaText()` 文本版；回归套件覆盖（`akasha-client` 18 项、`akasha-query` 38 项）。
- 未实现（待与另一位开发者确认取数方式后再接）：命令入口、出图模板、浏览器会话取数。
  目前默认取数实现是直连 HTTP，被 Cloudflare 挡住时抛 `AKASHA_BLOCKED`（不会静默给错数据）；
  `setTransport()` 是留给浏览器会话的注入点。
- 角色中文名走本插件角色表（akasha 只给 `Hu Tao` 这种英文名），武器/套装名走 akasha 的 `textmap` 中文化。

### 练度面板：整页复用 miao-plugin 的代码（需要装 miao-plugin）

练度查询的**画面完全由 [miao-plugin](https://github.com/AxiuCN/miao-plugin)（AxiuCN 版）自己的代码产出**——本插件不自绘面板：

| 环节 | 谁负责 |
|------|--------|
| 取数 | 本插件（站点 `/api/enka/uid/<uid>` 代理的 Enka 数据） |
| Enka → 面板模型（武器/圣遗物**按 itemId 反查名字与图标**、天赋、面板数值、圣遗物评分与词条权重） | miao 的 `models/serv/api/EnkaData.js` + `models/Avatar.js` + `Attr` / `ArtisMark` |
| 模板、样式、图标、布局、截图 | miao 的 `resources/character/profile-detail.html/.css`（经 miao 的 `Common.render`） |
| 面板立绘 | 本插件从 [AxiuCN/miao-plugin-ProfileImg](https://github.com/AxiuCN/miao-plugin-ProfileImg) 图库按**角色名**选一张（同一 UID 稳定取图）；图库没装或没收录该角色时，退回 miao 自己的官方立绘 |

- 因为名字与图标都由 miao 按 **itemId** 解析，站点 Enka 数据缺 `flat.name` 的新角色/新武器也能正常显示。
- **不渲染 miao 面板底部的「伤害计算」表**（`dmgCalc.dmgData` 传空）：那块依赖 miao 的伤害计算模块与敌人参数，本次按需求排除。
- 未安装 miao-plugin 时练度查询**回退纯文本**输出（其它命令不受影响）。
- 图库（300MB+，其 README 明确「严禁商用」）**不随本插件分发**，只按路径只读引用；可用 `profileImgDir` 指定位置。

## 更新

```bash
# 在 bot 里发送（推荐）
#更新 Mhydps-Plugin

# 或到插件目录手动拉取
cd <bot根>/plugins/Mhydps-Plugin && git pull
```

> **不要用手工拷贝覆盖插件目录里的文件**。插件目录是 git 仓库，拷进去的文件会被 git 视为「未提交的本地改动」，之后 `#更新` / `git pull` 会被 `local changes would be overwritten by merge` 直接拒绝。要改代码请在源码仓库里改、提交、推送，再到 bot 侧更新。

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
| `#DPS榜视频 3` | 发第 3 名的 B 站视频链接（站点每条记录都有投稿视频作证据）；可带榜单的全部筛选，如 `#DPS榜视频 1 胡桃 12金` |
| `#DPS危战榜视频 3` | 危战榜第 3 名的视频链接；可带 `版本:` / `首领:` 等筛选 |
| `#DPS练度查询 <9位UID>` | 该号等级最高角色的面板（一张图一个角色，画面由 miao-plugin 渲染） |
| `#DPS练度查询 <角色>` | 指定角色（如 `#DPS练度查询 胡桃`），支持别名（`桃`）；UID 取配置 `defaultUid` |
| `#DPS练度查询 <角色> <UID>` | 角色名与 UID 顺序随意、可写多个角色（`胡桃 夜兰`，顿号分隔也行） |
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
| `defaultUid` | 空 | 练度查询的默认 UID：填了就能直接 `#DPS练度查询 胡桃` |
| `profileImgDir` | 空 | 面板立绘图库根目录（含 `normal-character` 那一层），留空 = 自动探测 |
| `miaoPluginDir` | 空 | miao-plugin 目录（练度面板整页复用它的代码），留空 = 自动探测 `plugins/miao-plugin` |
| `miaoResDir` | 空 | miao-plugin 的 `resources` 目录（用于反推插件位置），一般不用填 |

## 渲染与字体

- **深色插画主题**：插画铺满整页，正文全部落在深色内容条（`--card`）上，文字用浅色；
  配色只写在 `resources/common/base.css` 的 `:root` 变量块，模板与组件一律 `var(--x)`，换主题只改这一块。
- **原神字体随插件分发**（`resources/common/font/`，不联网下载）：
  - `HYWH-65W.woff` —— 汉仪文黑-65W，原神标准中文，作正文主字体
  - `tttgbnumber.woff/.ttf` —— 提瓦特数字，作阿拉伯数字字体（字体栈里排在第一位，数字自动命中它）
- 字体在 `base.css` 用 `@font-face` 声明（`url("./font/...")` 相对 CSS 文件），模板不写 `font-family`；改字体只需替换字体文件与这段声明。
- **四个自绘页面各有整页插画底**：`bg-rank.jpg` / `bg-raid.jpg`（取自哥伦比娅3）+ `bg-help.jpg` / `bg-status.jpg`（取自哥伦比娅4），统一走 `--scrim` 压暗 + `--card` 内容条。
  - 为什么用内容条：文字直接压插画时，小字必须把插画洗到极淡才达标（实测 help 暗部 `#4b315c`，深色小字仅 1.9:1）；改成「插画 + 深色内容条」后插画保持清晰、文字以内容条为对比基准，两边都不妥协。
  - 对比度由 `test/contrast.test.mjs` 按令牌现算守门（最坏情况按纯白插画推）；换底图或调色后必须跑它，重新生成底图见 `tool/background/README.md`。
  - 页面四周只留 8~10px 画面边框（`body` / `.page-inner` 的 padding），卡片内边距 10px 上下：留边越小，同样图宽能放下的内容越多。
- 榜单行按站点层级排版：名次徽章 → 4 个描金圆环头像（右上角圆形命座数字）→ 大号伤害数字 → 金数（27px）→ 标签（18px）。**行尾不再有视频列**——视频证据统一用 `#DPS榜视频 <名次>` 指令取链接。
- 榜单**不显示元素标签**（火/水/冰…）——那是站点榜单里没有的信息；元素只在 `#DPS练度查询` 的角色卡上出现。
- **视频证据**：站点每条记录都带 `video_url`（B 站投稿）。榜单图**不放视频列**（那只是每行一个重复标记，占宽且无信息量）；要拿链接用 `#DPS榜视频 <名次>` / `#DPS危战榜视频 <名次>`，名次就是图里的编号（跨页连续、与筛选口径一致）。
- **练度面板不参与这套配色守门**：`#DPS练度查询` 的整页画面由 miao-plugin 的模板与样式渲染
  （`apps/build.js` → `model/MiaoBridge.js`），本插件的模板/样式里没有它的色值，也不再为它生成整页背景图。
- 榜单行按站点层级排版：名次徽章 → 4 个描金圆环头像（右上角圆形命座数字）→ 大号伤害数字 → 金数（27px）→ 标签（18px）。**行尾不再有视频列**——视频证据统一用 `#DPS榜视频 <名次>` 指令取链接。
- 榜单**不显示元素标签**（火/水/冰…）——那是站点榜单里没有的信息；元素只在 `#DPS练度查询` 的角色卡上出现。
- **视频证据**：站点每条记录都带 `video_url`（B 站投稿）。榜单图**不放视频列**（那只是每行一个重复标记，占宽且无信息量）；要拿链接用 `#DPS榜视频 <名次>` / `#DPS危战榜视频 <名次>`，名次就是图里的编号（跨页连续、与筛选口径一致）。
- **练度面板不参与这套配色守门**：`#DPS练度查询` 的整页画面由 miao-plugin 的模板与样式渲染
  （`apps/build.js` → `model/MiaoBridge.js`），本插件的模板/样式里没有它的色值，也不再为它生成整页背景图。
  - 面板文字压在立绘上、靠 `text-shadow` 辨认，这是 miao 的既有取舍；受影响的只有练度这一页，其余四页照旧受 `test/contrast.test.mjs` 约束。
  - **不渲染 miao 面板底部的「伤害计算」表**：`dmgCalc.dmgData` 传空数组，miao 模板里的 `{{if dmgData?.length > 0}}` 自然跳过（该表依赖 miao 的伤害计算模块与敌人参数）。

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
2. 站点「练度查询」自带一套**专有评分**（按角色配置有效词条再加权，见站点前端 bundle）。本插件不实现评分，而是**直接用 miao-plugin 的评分/词条权重**（`ArtisMark`）——所以练度图上的 `xx分 / SS / 圣遗物总分` 是 miao 的口径，不是站点的，也不是本插件自造的。
3. 练度页的**名字与图标**由 miao 按 `itemId` 反查它自己的静态表（`meta-gs/**`），因此不依赖站点 Enka 数据里的 `flat.name`；站点那份数据缺名字时（新角色/新武器常见）练度页依旧完整。
4. **面板数值（生命/攻击/防御/精通/双暴/充能，含 基础+加成 拆分）与天赋等级也由 miao 计算**：本插件只把 Enka 的原始数据喂给它。文本回退里的天赋等级仍是本插件的启发式（`skillLevelMap` 键末位），与出图可能略有出入。
5. 面板立绘是社区 fan art（ProfileImg 图库），与站点无关；图库按**角色名**匹配，图库里没有的角色退回 miao 的官方立绘。
6. **面板不含「伤害计算」**：miao 那张表（伤害类型 / 暴击伤害 / 期望伤害）依赖它的伤害计算模块与敌人参数，本次按需求不渲染（`dmgCalc.dmgData` 传空），miao 面板的其余部分照旧。

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
├── model/                   数据层：HTTP 客户端、榜单缓存、角色索引、Enka、立绘缓存、miao 面板桥接
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

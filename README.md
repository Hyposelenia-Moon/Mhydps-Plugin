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

### 练度面板的可选素材（不装也能用）

练度查询的面板版式照 [miao-plugin](https://github.com/AxiuCN/miao-plugin)（AxiuCN 版）的 `profile-detail`，素材**全部只读引用本机已装好的目录，不随本插件分发**（图库 300MB+ 且其 README 明确禁止商用）：

| 素材 | 来源 | 缺失时的表现 |
|------|------|--------------|
| 面板立绘（fan art） | [AxiuCN/miao-plugin-ProfileImg](https://github.com/AxiuCN/miao-plugin-ProfileImg)，即 `plugins/ProfileImg-Plugin/resources/gallery/ProfileImg/miao-plugin-ProfileImg`（或用 `profileImgDir` 指到别处） | 退回 miao 的官方立绘 → 站点 30KB 立绘 → 纯色头图 |
| 命座图标 / 武器图标 / 圣遗物图标 / 武器文案 | 本机 `plugins/miao-plugin/resources`（或用 `miaoResDir` 指到别处） | 对应图标与文案整块不显示，版式不变、不裂图 |
| 属性图标 / 卡片底纹 / 星级 | 同上（miao-plugin，MIT 许可） | 属性行只显示文字，卡片用纯色底 |

素材按需复制到 `<插件根>/data/panel/`（gitignore 的缓存目录），同一个角色每次渲染选同一张立绘（按 UID 哈希稳定取图）。命令里给了角色名时只渲染这些角色的面板。

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
| `#DPS练度查询 <9位UID>` | 该号公开角色（最多 6 个，一屏一角色）：面板、武器与圣遗物明细（Enka），面板版式照 miao-plugin |
| `#DPS练度查询 <角色>` | 只看指定角色（如 `#DPS练度查询 胡桃`），支持别名（`桃`）；UID 取配置 `defaultUid` |
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
| `miaoResDir` | 空 | miao-plugin 的 `resources` 目录（面板图标/武器文案来源），留空 = 自动探测 |

## 渲染与字体

- **深色插画主题**：插画铺满整页，正文全部落在深色内容条（`--card`）上，文字用浅色；
  配色只写在 `resources/common/base.css` 的 `:root` 变量块，模板与组件一律 `var(--x)`，换主题只改这一块。
- **原神字体随插件分发**（`resources/common/font/`，不联网下载）：
  - `HYWH-65W.woff` —— 汉仪文黑-65W，原神标准中文，作正文主字体
  - `tttgbnumber.woff/.ttf` —— 提瓦特数字，作阿拉伯数字字体（字体栈里排在第一位，数字自动命中它）
- 字体在 `base.css` 用 `@font-face` 声明（`url("./font/...")` 相对 CSS 文件），模板不写 `font-family`；改字体只需替换字体文件与这段声明。
- **五张图各有整页插画底**：`bg-rank.jpg` / `bg-raid.jpg` / `bg-build.jpg`（取自哥伦比娅3）+ `bg-help.jpg` / `bg-status.jpg`（取自哥伦比娅4），统一走 `--scrim` 压暗 + `--card` 内容条。
  - 为什么用内容条：文字直接压插画时，小字必须把插画洗到极淡才达标（实测 help 暗部 `#4b315c`，深色小字仅 1.9:1）；改成「插画 + 深色内容条」后插画保持清晰、文字以内容条为对比基准，两边都不妥协。
  - 对比度由 `test/contrast.test.mjs` 按令牌现算守门（最坏情况按纯白插画推）；换底图或调色后必须跑它，重新生成底图见 `tool/background/README.md`。
  - 页面四周只留 8~10px 画面边框（`body` / `.page-inner` 的 padding），卡片内边距 10px 上下：留边越小，同样图宽能放下的内容越多。
- 榜单行按站点层级排版：名次徽章 → 4 个描金圆环头像（右上角圆形命座数字）→ 大号伤害数字 → 金数（27px）→ 标签（18px）。**行尾不再有视频列**——视频证据统一用 `#DPS榜视频 <名次>` 指令取链接。
- 榜单**不显示元素标签**（火/水/冰…）——那是站点榜单里没有的信息；元素只在 `#DPS练度查询` 的角色卡上出现。
- **视频证据**：站点每条记录都带 `video_url`（B 站投稿）。榜单图**不放视频列**（那只是每行一个重复标记，占宽且无信息量）；要拿链接用 `#DPS榜视频 <名次>` / `#DPS危战榜视频 <名次>`，名次就是图里的编号（跨页连续、与筛选口径一致）。
- **练度面板是唯一的配色例外**：`#DPS练度查询` 的版式与配色逐条照抄 miao-plugin 的 `profile-detail`（`#fff` 文字 + 交错暗行 + `#ffe699` 高亮），色值集中在 `resources/profile/panel.css`，模板本身仍不写颜色。
  - 代价：miao 的文字直接压在立绘上、靠 `text-shadow` 辨认，亮色立绘上的小字达不到 WCAG AA，所以**练度面板不做对比度守门**（其余四页照旧受 `test/contrast.test.mjs` 约束）。
  - 想让它更稳：把 `panel.css` 里的 `.panel-basic::after` 那层暗角加深即可，代价是立绘变暗。
  - **不搬 miao 面板底部那块「伤害计算」表**：它依赖 miao 自己的伤害计算模块与敌人参数，本站数据里没有对应字段，所以面板到「武器卡 + 圣遗物卡」为止（暴击伤害只是属性行的一项，保留）。

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
2. 站点「练度查询」自带一套**专有评分**（按角色配置有效词条再加权，见站点前端 bundle）。本插件不复刻评分（也不做圣遗物的 `xx分/SS` 评级），只给出面板（生命/攻击/防御/精通/双暴/充能）、武器面板、5 件圣遗物主副词条与副词条条数。
3. 天赋等级按 Enka `skillLevelMap` 键末位（1/2/3 = 普攻/战技/爆发）取每个位次键最小的一套，多形态角色可能与站点展示略有出入。
4. 练度面板的**武器被动文案**来自本机 miao-plugin 的静态表（游戏内原文，按当前精炼档位取），站点接口里没有这段文本；同时站点的 Enka 数据里也没有原神天赋图标，所以三枚天赋徽章用「位次名 + 等级」而非图标。
5. 面板立绘是社区 fan art（ProfileImg 图库），与站点无关；图库按**角色名**匹配，图库里没有的角色退回官方立绘/站点立绘。
6. **面板不含「伤害计算」**：miao 那张表（伤害类型 / 暴击伤害 / 期望伤害）来自它自己的伤害计算模块与敌人参数，本站接口没有这些字段，本插件不猜也不算，面板只呈现 Enka 面板、武器、圣遗物与命座/天赋。

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
├── model/                   数据层：HTTP 客户端、榜单缓存、角色索引、Enka、立绘缓存、面板素材
├── modules/                 业务层：参数解析、榜单查询、练度组装、文本回退
├── components/              配置、常量、版本号、渲染
├── guoba/ + guoba.support.js 锅巴配置面板
├── defSet/ + config/        配置三层
├── resources/               模板、样式、帮助配置、随包数据表
│   └── profile/panel.css    练度面板样式（照抄 miao 配色，唯一允许写死色值的文件）
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

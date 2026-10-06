# AGENTS.md

本文件是 **Mhydps-Plugin 的仓库结构约束落地副本**，权威定义在用户级 skill `plugin-repo-layout`；两者冲突时以 skill 为准，并回写本文件。

## 一、插件定位

TRSS-Yunzai v3 插件，只做一件事：把 [mhydps.cn](https://www.mhydps.cn/) 的只读数据搬进群聊。

- 数据来源是**非官方接口**，站点改版即可能失效；所有请求集中在 `model/MhydpsClient.js`，字段解读集中在 `model/` 与 `modules/`，便于站点变动时定点修改。
- 本插件**不投稿、不投票、不写站点数据**，只有 GET。

## 二、目录结构

```
Mhydps-Plugin/
├── index.js                 入口：初始化配置 → 载入磁盘缓存 → 动态加载 apps/
├── package.json  .gitignore  .gitattributes  AGENTS.md  README.md  LICENSE
├── apps/                    功能入口，每个文件导出 class extends plugin
├── model/                   数据层：自己发 HTTP 或读写数据，不 import modules/
├── modules/                 业务层：编排、筛选、组装视图，可 import model/ 与 components/
├── components/              可复用组件：配置、常量、版本号、渲染
├── config/                  运行时配置（不入库）+ config.yaml.example（入库）
├── defSet/config.yaml       锅巴模板（${变量} 占位符 + 注释）
├── guoba.support.js  guoba/ 锅巴 Web 配置
├── resources/               dps/*.html、common/*.css、help/help-cfg.js、data/*.json
└── test/                    回归套件（不启动 bot）
```

不设 `lib/`、不设 `tool/`（没有外部可执行文件）、不建空目录。

### 文件该放哪（四步石蕊测试）

| # | 问 | `model/` | `modules/` |
|---|----|----------|------------|
| 1 | import 了什么？ | 只 import node 内置、常量、配置 | import 了 `../model/` 或 `../components/` |
| 2 | 一句话怎么描述？ | 「调 X 接口返回 Y」 | 「先…再…」 |
| 3 | 谁发 HTTP？ | 自己发 | 自己不发，调 model/ |
| 4 | 有可变状态吗？ | 最多缓存/超时 | 管理锁、跨操作状态 |

## 三、分层实况（本仓库当前映射）

| 文件 | 层 | 一句话 |
|------|----|--------|
| `model/MhydpsClient.js` | model | 发 HTTP：拼 Referer、可走代理、带超时 |
| `model/TeamStore.js` | model | 拉 `/api/teams`、`/api/teams2`，落盘 `data/` + 内存缓存 + TTL |
| `model/CharacterIndex.js` | model | 读随包角色表/首领表，提供角色与首领检索 |
| `model/EnkaClient.js` | model | 调站点 Enka 代理取练度数据、翻译错误 |
| `model/AvatarStore.js` | model | 立绘下载与缓存 |
| `model/startup.js` | model | 启动编排（只载入磁盘缓存，不发网络） |
| `modules/queryArgs.js` | modules | 命令参数解析（显式键值 + 位置简写） |
| `modules/rankQuery.js` / `raidQuery.js` | modules | 榜单筛选、排序、分页、组装视图行 |
| `modules/buildQuery.js` | modules | Enka 原始数据 → 面板/武器/圣遗物视图 |
| `modules/teamView.js` | modules | 榜单行共用视图（成员头像/命座、金数、标签） |
| `modules/formatText.js` | modules | 渲染失败时的纯文本回退 |
| `modules/respond.js` | modules | 出图 + 失败回退的统一回复 |

## 四、约定

### 入口与命令

- 单入口模式：`index.js` 负责 `readdir` + `Promise.allSettled` 动态加载 `apps/` 下所有 `.js`。
- 每个 `apps/*.js` 只导出**一个** class；类名 PascalCase，`name` / `dsc` 用简体中文。
- 所有命令以 `#DPS…` 命名空间开头（`#DPS榜` / `#DPS危战榜` / `#DPS练度查询` / `#DPS状态` / `#DPS帮助` / `#DPS更新`），避免与 miao-plugin（`#面板`）、Atlas-Plugin（`^#(.+)$`）抢词。
- **改动命令正则 / 触发词 / 权限等级属对群友可见的改动，必须先与维护者确认。**
- `priority` 默认 8000（低于 Atlas 的 10000），改动此值前先确认不会被别的插件吃掉。

### 配置三层

```
defSet/config.yaml          ← 模板（${mhydps_*} 占位符 + 注释）
  ↓ 锅巴保存
guoba/index.js              ← 读模板 → 替换变量 → 写 config/config.yaml
config/config.yaml          ← 运行时（不入库）
config/config.yaml.example  ← 参考默认值（入库，首次启动自动复制）
```

- 锅巴 field 用点分隔路径，模板变量用下划线（`cacheTtlMinutes` → `${mhydps_cacheTtlMinutes}`）。
- 禁止用 `YAML.stringify` 整写配置（会抹掉注释），一律模板替换。
- 改配置键时**同一轮**同步：`defSet/config.yaml`、`config/config.yaml.example`、`guoba/index.js` 的 `TEMPLATE_VARS` 与 `DEFAULTS`、`components/config.js` 的 `defaultConfig`。

### 网络与数据

- 站点请求必须带 `Referer: https://www.mhydps.cn/`（否则 nginx 403），统一走 `model/MhydpsClient.js`。
- 代理只从配置 `proxy` 取，不读环境变量、不写死地址。
- 任何网络失败都要能降级：查询走本地缓存并提示数据时间；渲染失败回退文本（`modules/respond.js`）。
- 缓存与立绘写 `<插件根>/data/`（gitignore）；不往仓库外写文件。

### 渲染

- 模板在 `resources/dps/*.html`，art-template 语法；`{{_res_path}}` / `{{_data_path}}` / `{{renderScale}}` / `{{copyright}}` 由 `components/render.js` 注入。
- 模板内不写 `<script>`；字体随包分发（见下一条），不引用站外字体。
- **配色只写在 `resources/common/base.css` 的 `:root` 变量块**（当前为深色插画一套）：`components.css` 与 5 个模板一律 `var(--x)`，不得写死色值；这条由 `render-templates` 套件守门（模板里出现 hex/rgba 或遗留旧令牌都会红）。
  - **唯一例外**：`resources/profile/panel.css`（练度面板）按需求逐条照抄 miao-plugin `profile-detail` 的固定色值，套件对它单独豁免；不要把它的色值搬进共享组件，也不要拿它的写法去改其它页面。
- **字体也只写在 `base.css`**：`@font-face` 声明原神字体（`resources/common/font/HYWH-65W.woff` 中文 + `tttgbnumber` 数字，随包分发、不联网下载），字体栈把数字字体排在最前；模板不得出现 `font-family`（套件会检查）。换字体 = 换文件 + 改这段声明。
- 榜单行版式对齐站点：名次徽章 → 4 个描金圆环头像（右上角圆形命座数字，仅数字不带 C）→ 大号伤害数字（34px）→ 金数（27px）→ 标签（18px）。**行尾不放视频列**，视频链接走 `#DPS榜视频 <名次>`。
- 帮助图内容来自 `resources/help/help-cfg.js`，版式是「整页插画底 + 深色内容条（副标题行 / 分组标题条 / 三列指令网格）」，每项只有 `title` / `desc` 两个字段——**不要加回语法块 / 参数表 / 示例块**（`help-config` 套件会因条目出现多余字段而报红）。参数写法请直接落成可照抄的命令条目（如 `#DPS榜 金≤12`）。
- 5 个页面都是**整页插画底**（`resources/common/bg-rank|raid|build|help|status.jpg`）：图片来自 `纯享壁纸/哥伦比娅3/4`，由 `tool/background/crop-background.ps1` 按页面长宽比裁切生成（不抬暗部）；渲染时 `.page-bg` 打底、`--scrim` 统一压暗，`filter: blur(--bg-blur)` 只作可调项（当前 0）。
- 页面四周只留 **8~10px 边框**（`body` 与 `.page-inner` 的 padding 都是 `8px 10px 10px`）：这就是出图里插画与画面边缘之间的距离，调大等于白白吃掉内容宽度；卡片内边距同理保持在 10px 上下。
- **正文一律落在 `--card` / `--chip` 深色内容条上，不要把文字直接压插画**：文字直接压插画时，浅色小字必须把插画洗到极淡（实测 help 暗部 `#4b315c` 上深色小字仅 1.9:1）才可能达标；「插画 + 内容条」让插画与文字各自有独立的对比基准。调 `--scrim` / `--card` 后必须跑 `test/contrast.test.mjs`（它按令牌现算最坏情况，纯白插画为界）。
- 迭代配色时可用 `tool/background/fullpage-contrast.ps1` 对真实底图取点复核；剪影/取色脚本只作一次性诊断，不进仓库。
- **改文字色或调蒙版后必须跑 `test/contrast.test.mjs`**（离线按令牌现算 WCAG：正文 ≥4.5:1、大字 ≥3:1、最小字号 ≥14px）；换了背景图还要跑 `tool/background/hero-contrast.ps1` 复核横幅文字。
- `components/render.js` 的 `RES_PREFIX` 层级依赖框架把 HTML 写到 `temp/html/<插件名>/<APP>/<tpl>/`，改动模板命名前先读该文件注释。

### 练度面板（`#DPS练度查询`）

- **练度面板整页复用 miao-plugin（AxiuCN 版）的代码，本插件不自绘**：`apps/build.js` 取数（站点 Enka 代理）→ `model/MiaoBridge.js` 用 miao 的 `EnkaData` / `Avatar` / `Attr` / `ArtisMark` 建面板模型 → 调 miao 的 `Common.render('character/profile-detail', ...)` 出图（模板、样式、图标、布局、缩放全是 miao 的）。
- **不要在本插件里重新实现面板**：模板/样式/评分/词条权重都不要抄一份（抄了就会像 v1 那样在「站点缺 `flat.name`、天赋缺位次」时出错）。要改观感请改 miao-plugin 或给它提 issue；本插件只决定「喂什么数据」与「用哪张立绘」。
- 关键收益：名字与图标由 miao 按 **itemId** 反查它的静态表，站点 Enka 数据缺 `flat.name`（新角色/新武器常见）也能正常显示；面板数值与圣遗物评分也由 miao 现算。
- **不渲染「伤害计算」表**：`toPanelData` 固定传 `dmgCalc.dmgData = []`，靠 miao 模板里的 `{{if dmgData?.length > 0}}` 跳过；不要为了让表出现去接 miao 的 `ProfileDmg`/`calcDmg`。由 `miao-bridge` 套件守门。
- 立绘走 `model/ProfileImg.js`：只读引用本机 ProfileImg 图库（**不入库**，300MB+ 且禁止商用），按角色名匹配、按 `avatarId` 稳定取图；没有图库或没收录该角色时传空串，miao 会退回它自己的官方立绘。
- 桥接的硬约束：miao 的代码假设 **cwd = bot 根**；我们用一个独立 `Player` 实例（uid 加 `mhydps-` 前缀）承载解析结果并**从不调用 `save()`**，避免污染 miao 自己的 PlayerData 缓存与内存实例。
- miao-plugin 缺失或解析失败 → 回退本插件的纯文本（`buildText`）；纯文本里的天赋等级仍是本站启发式，口径差异写在 README。
- 面板页**不做对比度守门**（miao 的文字直接压在立绘上），这是明确接受的取舍；`test/contrast.test.mjs` 只扫本插件自己的 4 个页面。
- `#DPS练度查询` 支持带角色名筛选（`parseBuildArgs` → `pickAvatarsByNames`）：角色名/别名经角色表解析成 `avatarId` 再过滤；**关键词全都不是角色名时不当作筛选**（原样出全部 + 一行「未识别的参数」），命中角色名但该号没有该角色才算筛选落空。面板一张图一个角色，默认出等级最高的那个。

### 日志与注释

- 日志只用 `logger?.info` / `logger?.warn` / `logger?.error`。
- 注释写「现在是什么、为什么这样设计、边界在哪」，不写单次 bug 修复过程与历史沿革。
- 版本号统一从 `components/pluginVersion.js` 取，页脚文案 `COPYRIGHT` 在 `components/constants.js`。

## 五、测试

- 结构：`test/_helper.mjs`（路径/前置/断言/框架桩）+ `test/run.mjs`（运行器）+ `test/fixtures/`（离线样例）+ `<主题>.test.mjs`。
- `pnpm test` = `node test/run.mjs`，**任意 cwd 可跑**，不启动 bot、不发真实网络请求（真实接口只由人工验证）。
- **缺前置一律打印「跳过」并 `exit 0`**（例如没有浏览器时不跑渲染类套件）。
- 临时产物写 `test/.test-tmp/`（gitignore）；套件不得改动仓库里的源数据。
- 只测对外行为与契约，不 import 生产代码的私有函数。

## 六、部署与验证（单向链路）

同一份代码存在于两个位置，**只有一处允许被修改**：

| 位置 | 角色 | 允许的操作 |
|------|------|------------|
| 源码工作区（如 `D:\文件\游戏\原神\Mhydps-Plugin`） | 唯一的工作树 | 改代码、跑离线套件、提交、推送 |
| `<bot根>/plugins/Mhydps-Plugin` | 部署副本（git clone），由框架 `#更新` 用 git 维护 | 只允许 `#更新 Mhydps-Plugin` / `git pull` |

**禁止把工作区的文件拷进部署副本**（robocopy / 手工复制 / 解压覆盖都不行）：那会在部署副本里制造「未提交的本地改动」，此后每次 `git pull` 都会被 `local changes would be overwritten by merge` 中止，框架只能提示改用 `#强制更新`。

真机验证的顺序：

1. 在工作区改完 → 跑 `node test/run.mjs`（离线套件，**不要碰 bot 目录**）
2. 提交并推送
3. 在 bot 里发 `#更新 Mhydps-Plugin`（或到部署副本执行 `git pull`）
4. 再在部署副本里跑 `node test/run.mjs`（渲染套件只有这里能跑），并检查出图

部署副本里跑套件只会写 gitignore 的 `test/.test-tmp/` 与框架的 `temp/`，不改动任何被跟踪文件。

## 七、Git

- **不执行任何 git 操作**（`add` / `commit` / `push` / `merge` / `rebase` / `pull` 等），由维护者执行。
- 改动完成后给提交摘要：单行标题 `prefix: 中文描述`（`feat:` / `fix:` / `refactor:` / `chore:` / `docs:`），详细列表每行 `- ` 一项。
- 不要在部署副本里直接改文件后提交：部署副本只接受远端拉取（见第六节）。

## 八、需先确认才能做的事

- 改命令正则 / 触发词 / 权限等级 / 对群友可见的行为
- 改 `priority` 默认值
- 新增依赖
- 大面积移动、重命名、删除文件
- 修改本文件

# 回归套件（test/）

Mhydps-Plugin 的回归套件。**不启动 bot、不走真实网络**，直接跑生产代码路径（参数解析、筛选排序、缓存往返、练度换算、配置三层、模板渲染）。

## 怎么跑

```bash
node test/run.mjs                 # 全部
node test/run.mjs --filter=rank   # 只跑文件名含 rank 的
node test/run.mjs --list          # 只列清单
pnpm test                         # 等价于 node test/run.mjs
node test/query-args.test.mjs     # 单个（任意 cwd 都行）
```

跑之前先装依赖（`yaml`、`https-proxy-agent`）：

```bash
pnpm install            # 在插件目录执行；或把插件放进 bot 的 plugins/ 后 pnpm install --filter=Mhydps-Plugin
```

## 前置与「跳过」

| 前置 | 何时缺 | 怎么补 |
|------|--------|--------|
| 依赖 `yaml` / `https-proxy-agent` | 未安装 | 插件目录执行 `pnpm install`（或装在 bot 根） |
| bot 渲染环境（`<bot根>/lib/puppeteer/puppeteer.js`） | 在源码工作区里跑 | 把插件放到 `<bot根>/plugins/Mhydps-Plugin` 再跑 |
| 插件安装在 `<bot根>/plugins/Mhydps-Plugin` | 直接在别的目录跑渲染套件 | 同上（模板与资源按该路径解析） |
| 浏览器（Edge / Chromium） | 没装 | 设 `MHYDPS_TEST_BROWSER=<可执行文件路径>` |

缺任一项时，受影响的套件打印「⏭ 跳过：原因」并以 0 退出（不算失败）。

## 数据来源

- 榜单类套件用 `test/fixtures/teams.sample.json`、`teams2.sample.json`（站点 `/api/teams`、`/api/teams2` 的字段结构，值已改写）。
- 练度类套件用 `test/fixtures/enka.sample.json`（Enka 结构的最小样例）。
- 立绘图库类套件不读真实安装：用 `MHYDPS_PROFILE_IMG` 指向 `test/.test-tmp/` 里自建的假图库。
- akasha 类套件全程离线：用 `setTransport()` 注入假取数，fixtures 是脱敏后的真实响应（`akasha.account.sample.json` / `akasha.calc.sample.json`）。
- `miao-bridge` 需要本机装了 miao-plugin（工作区里可用 `MHYDPS_MIAO_PLUGIN` 指向它）；没装就跳过。
- **套件不发真实请求**：真实接口的正确性只能靠人工验证（`#DPS更新` + 三条查询命令）。

## 约定

1. **任意 cwd 可跑**：路径一律经 `test/_helper.mjs` 推导，不写裸相对字面量、不写盘符绝对路径。
2. **不改动仓库数据**：`_helper.mjs` 默认把 `MHYDPS_DATA_DIR` 与 `MHYDPS_CONFIG_FILE` 指向 `test/.test-tmp/`，
   套件不会写仓库里的 `data/` 与 `config/config.yaml`；渲染套件只临时写入一张 1×1 假立绘并自行删除。
3. **临时产物只写 `test/.test-tmp/`**（gitignore）；渲染套件把每个模板的渲染产物留在 `test/.test-tmp/render/` 供人工查看。
4. **文件名 `<主题>.test.mjs`**，主题写被测行为（`query-args`、`rank-filter`、`team-store`…）。
5. **断言风格**：`_helper.mjs` 的 `checker()` 计数 + 末尾 `finish()` 按失败数退出。
6. **只走公开接口**：套件不 import 生产代码的私有函数；需要桩时只用 `_helper.mjs` 的框架全局桩（logger/redis/cfg/segment）。

## 目录

```
test/
├── _helper.mjs                 公共设施（路径 / 前置 / 计数 / 框架全局桩）
├── run.mjs                     运行器（顺序跑 + 汇总）
├── fixtures/                   离线样例（站点接口字段结构）
└── *.test.mjs                  套件
```

## 套件一览

| 套件 | 钉住什么 |
|------|----------|
| `character-index` | 别名检索（火神/龟/爷）、立绘 id 映射、首领与版本表 |
| `query-args` | 命令参数两条写法（显式键值 / 位置简写）落到同一组参数 |
| `rank-filter` | DPS 榜角色（含别名）/主C/金数/标签/绿玩筛选与排序、名次编号 |
| `raid-filter` | 危战榜版本/首领/角色/金数筛选与站点默认排序口径 |
| `team-store` | 记录归一、缓存磁盘往返、TTL 过期判定、损坏缓存不抛错 |
| `build-view` | Enka 换算：圣遗物等级 1 基、武器精炼 0 基、面板百分比 ×100 |
| `enka-client` | 练度接口地址拼装（相对路径 → 站点全地址）与连接失败的错误分支 |
| `text-fallback` | 渲染失败时的文字版必须含名次/伤害/金数/角色/数据时间 |
| `config-limits` | 配置越界值夹取（缩放、分页、超时、TTL）与代理修剪 |
| `startup-lifecycle` | 启动只读磁盘缓存、损坏缓存不阻断插件加载 |
| `help-config` | 帮助配置结构契约（字段齐全、标题以 # 开头、主人分组） |
| `guoba-config` | 配置三层同构：模板占位符 ↔ 面板字段 ↔ 默认配置 + 真实往返 |
| `render-templates` | 4 个自绘模板真实渲染出图，且模板内资源/头像相对路径能解析到文件（练度面板由 miao-plugin 渲染，不在此列） |
| `command-routing` | 各入口正则的匹配边界（谁的词归谁，`#DPS练度查询 胡桃` 不被榜单/视频抢走） |
| `video-lookup` | 名次取词、按名次取视频、越界与空结果的兜底文案 |
| `contrast` | 深色主题令牌的 WCAG AA 现算 + 最小字号 + 「直接压在插画上的容器必须自带暗底」 |
| `profile-img` | 面板立绘图库：目录探测、按角色名匹配、稳定选图、缺失降级 |
| `akasha-client` | akasha 接口层：端点拼装、取数注入、错误映射（403 挑战页/404/非 JSON）、缓存往返与失效 |
| `akasha-query` | akasha 解析：账号画像、名次→top%、赛道、名字中文化、筛选与截断、文本回退 |
| `miao-bridge` | 复用 miao-plugin 面板代码的桥接：`ival→val` 归一化、按 itemId 解析名字、伤害计算传空（缺 miao 时跳过） |

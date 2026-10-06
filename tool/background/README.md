# tool/background — 背景图生成与对比度审计

榜单页 / 帮助页的插画**整页覆盖**（`background-size: cover`），并在 CSS 里做两层处理：

```
插画（已抬暗部）→ filter: blur(var(--bg-blur)) → --page-veil 薄白纱 → 正文直接压在上面
```

**为什么必须抬暗部 + 模糊**：整页覆盖时正文会压在插画最暗的像素上。实测未处理时 help 插画的暗部是 `#4b315c`（相对亮度 0.09），深色小字压上去只有 1.9:1。抬暗部（生成图片时就做）把最暗处抬到约 `#c3acd7`、模糊再把局部明暗压平，这样薄白纱只需要 0.44 就能让全部文字达标，插画本身仍然清晰可见。

两个脚本都用 .NET `System.Drawing`，无需额外依赖，Windows PowerShell 5.1 可直接跑（**纯 ASCII 脚本 + 参数传中文路径**：PS 5.1 按 ANSI 读脚本文件，脚本内写中文会解析失败）。

## 1. 生成背景图：`crop-background.ps1`

```powershell
# 按「实际出图长宽比」裁窗口；-ShadowLift 抬暗部（0~0.8）
powershell -NoProfile -ExecutionPolicy Bypass -File tool\background\crop-background.ps1 `
  -Src "D:\...\哥伦比娅3.jpeg" -Out "resources\common\bg-rank.jpg" `
  -Aspect 0.70 -Y 1600 -OutWidth 1200 -Quality 80 -ShadowLift 0.64
```

- `-Aspect` 传「宽 / 高」；`-Y` 指定窗口顶部（`-1` 自动挑最亮窗口）
- `-ShadowLift L`：曲线 `out = 255 × (L + (1-L) × (in/255)^0.9)`，只抬暗部、亮部保持 255。当前定稿 **0.64**
- 取景要让角色头部落在画面上部（整页覆盖时不会有横幅裁切问题，但顶部是页头文字区）

当前素材与参数：

| 文件 | 素材 | 窗口 | ShadowLift |
|------|------|------|-----------|
| `resources/common/bg-rank.jpg` | `哥伦比娅3.jpeg`（1500×9000 长图） | y=1600 起、比例 0.70 → 1200×1714 | 0.64 |
| `resources/common/bg-help.jpg` | `哥伦比娅4.png`（1080×1920） | y=0 起、比例 1.02 → 1079×1058 | 0.64 |

## 2. 对比度审计：`fullpage-contrast.ps1`

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tool\background\fullpage-contrast.ps1 `
  -BgRank resources\common\bg-rank.jpg -BgHelp resources\common\bg-help.jpg -Veil 0.44
```

- 把插画降采样到 1/28 再取像素 → 等价于「重度模糊后的局部均值」，取**最暗**像素作为深色文字的最坏底
- 按 WCAG 2.1 判定：正文 ≥4.5:1、大字 ≥3:1
- 元素色（火/水/冰…）不在此审计内：它们只出现在练度页（白底），由 `test/contrast.test.mjs` 覆盖
- 最近一次结果：rank **0/9 失败**（最低 muted-2 4.66:1）｜help **0/9 失败**（最低 4.80:1）

## 3. 离线守门：`test/contrast.test.mjs`

改配色后不必跑上面的脚本：该套件从 `base.css` 现算令牌对比度 + 全项目最小字号（≥14px），随 `pnpm test` 一起跑。

## 令牌现状

| 令牌 | 值 | 作用 |
|------|----|------|
| `--bg-blur` | 18px | 插画模糊半径；调 0 可关（文字可读性会下降） |
| `--page-veil` | 0.44 | 薄白纱；调低插画更鲜艳、深色小字对比度下降 |
| `--row-veil` | 0.26 | 榜单行 / 帮助分组条的极淡底色（不用不透明白卡，避免把插画切成碎片） |
| `--radius` | 12px | 卡片与容器圆角 |

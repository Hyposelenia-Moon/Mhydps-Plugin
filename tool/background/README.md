# tool/background — 背景图裁切与横幅文字对比度审计

榜单页 / 帮助页的插画**只出现在顶部横幅里**（满强度、不加白蒙版），正文全部落在下方白底容器上——这样插画不被洗淡、正文对比度以纯白为基准，两者不再互相妥协。

两个脚本都用 .NET `System.Drawing`，无需额外依赖，Windows PowerShell 5.1 可直接跑。

## 1. 裁横幅图：`crop-background.ps1`

```powershell
# 横幅尺寸：rank 1086x210 CSS、help 1156x250 CSS（renderScale 1.5 下分别为 1629x315 / 1734x375）
powershell -NoProfile -ExecutionPolicy Bypass -File tool\background\crop-background.ps1 `
  -Src "D:\...\哥伦比娅3.jpeg" -Out "resources\common\bg-rank.jpg" -Aspect 0.573 -Y 1500 -OutWidth 1200 -Quality 80
```

- `-Aspect` 传「宽 / 高」；脚本按素材宽度算出窗口高度，再缩放到 `-OutWidth`
- `-Y` 指定窗口顶部（`-1` 则自动挑最亮窗口）；**取景要让角色头部落在横幅中上部**，因为横幅底部是深色渐变区（放标题）
- 纯 ASCII 脚本 + 参数传中文路径：PowerShell 5.1 按 ANSI 读脚本文件，脚本内写中文会解析失败

当前素材与取景：

| 文件 | 素材 | 取景 |
|------|------|------|
| `resources/common/bg-rank.jpg` | `哥伦比娅3.jpeg`（1500×9000 长图） | 1500..4000 段 → 1200×2000，缩放到横幅后取 15% 位置 |
| `resources/common/bg-help.jpg` | `哥伦比娅4.png`（1080×1920） | 顶部 941px → 1080×941，横幅取 26% 位置 |

## 2. 横幅文字对比度审计：`hero-contrast.ps1`

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tool\background\hero-contrast.ps1 `
  -BgRank resources\common\bg-rank.jpg -BgHelp resources\common\bg-help.jpg
```

按**原图 + CSS 渐变公式**复算（不采样成图，避免文字抗锯齿像素干扰），对横幅内文字带取最亮等效底色，再算白字对比度：

- 横幅只放**大号标题**（rank 30px / help 34px）→ 阈值 3.0:1
- 小字（副标题、版本行、条数时间）一律放白底区，按纯白基准判定（阈值 4.5:1）
- 最近一次结果：rank **10.20:1** ✓（need 3.0）｜help **15.02:1** ✓（need 3.0）

## 3. 离线守门：`test/contrast.test.mjs`

改配色后不用跑上面的脚本也能拦住回归：该套件从 `base.css` 现算令牌对比度（正文 ≥4.5:1、大字 ≥3:1）+ 全项目最小字号 ≥14px，`pnpm test` 里一起跑。

## 令牌现状

| 令牌 | 值 | 作用 |
|------|----|------|
| `--hero-scrim` | `linear-gradient(0 → 0.72@62% → 0.85@72% → 0.90)` | 横幅底部深色渐变，托住白字；上段（0~34%）完全透明，插画满强度 |
| `--hero-text` / `--hero-text-sub` | 白 / 白 0.86 | 横幅内文字色 |
| `--hero-radius` | 12px | 横幅与白底容器圆角 |

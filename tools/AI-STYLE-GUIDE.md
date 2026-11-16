# 风格稳定 + 尺寸格式统一的完整流程

**核心认知：AI 只负责"风格"，尺寸和格式永远自己补最后一刀。**

```
① 预处理：把网图/照片全部切成 4:5（tools/normalize.ps1）   ← 构图从源头就统一
② 风格转换：固定参数的 img2img，1 张原图 → N 张只换灯光词   ← 风格稳定靠"输入不动"
③ 后处理：再跑一次 normalize.ps1 统一成 1024×1280 PNG       ← 尺寸格式 100% 一致
```

---

## 一、先做预处理（很重要，决定后面稳不稳）

```powershell
.\tools\normalize.ps1 -In .\素材原图 -Out .\素材-ready -Names a1.png,a2.png,a3.png,a4.png
```

为什么必须先切：AI 图生图会**继承输入的构图和比例**。你喂进去的图如果有的 16:9、有的 9:16，
出来的 4 张必然五花八门；先统一成 4:5，输出就天然一致。

---

## 二、路线 A：在线平台（最快，1 小时能出全套）

适合：Nano Banana / Gemini 图像编辑、Flux Kontext、即梦「图片编辑」、豆包、MJ 的 `--cref`。

**关键是走「图片编辑 / 风格转换」，不要走「文生图」。** 文生图 100% 不像。

把原图上传后，粘这段指令（每张只改最后一行）：

```
把这张照片转成低多边形（low-poly）肖像插画：
用不规则三角面片重组人物，每个三角形填充单一纯色、不要任何渐变或柔和过渡，
面片边界锐利清晰，用切面表现皮肤明暗与头发走向，
面部五官结构保持不变、必须认得出是同一个人，
纯深灰色背景，半身像，高对比，矢量插画质感，4:5 竖版。

灯光：冷蓝色舞台侧光，暗调                          ←【只改这一行】
```

四幕的四个灯光词：

| 幕 | 替换成 |
| --- | --- |
| ① 年初 | `灯光：冷蓝色舞台侧光，暗调` |
| ② 先锋赛 | `灯光：金色聚光灯从正上方打下，暖金高光` |
| ③ MSI 崩盘 | `灯光：暗红色警示光，大面积阴影，低饱和` |
| ④ 捧杯 | `灯光：金色雨背光，强烈暖金轮廓光，明亮` |

一致性要点：
- **同一张原图**跑 4 次（不是 4 张不同照片各跑一次），人就不会变样。
- 每次都用同一个「风格前缀」，只改灯光那一行；不要重写描述。
- 平台有 seed / 随机种子选项就填死同一个数字。
- 如果平台支持「角色一致性 / 参考图」，把第一次出好的图当参考再改灯光。

---

## 三、路线 B：本地 SD / ComfyUI（最稳，能批量）

一个工作流跑完 4 张，参数完全一致。基准参数：

| 项 | 值 | 说明 |
| --- | --- | --- |
| 底模 | SDXL 或 Flux.1 dev | Flux 对"保持原图"更强 |
| LoRA | 搜 `low poly` / `polygonal` / `faceted portrait` / `lowpoly style` | weight **0.7~0.9**，风格稳定主要靠它 |
| 工作模式 | **img2img** | 文生图一定不像 |
| Denoise / 重绘幅度 | **0.42~0.55** | 低了还是照片，高了五官漂 |
| Steps | 28~35 | |
| CFG | SDXL 5~7 / Flux 3.5~4.5 | |
| Sampler | DPM++ 2M Karras / Euler a | 固定别换 |
| 尺寸 | **1024×1280** | 与页面舞台 4:5 一致 |
| Batch | 4（每次只改 prompt 灯光词） | 同一次运行参数全同 |
| Seed | **固定** | 换图也先别动 |
| ControlNet | canny 或 lineart，weight 0.6~0.8 | 锁住五官位置和构图 |
| 可选 | IP-Adapter 喂 1 张你满意的低多边形图 | 锁风格 |

提示词（正/负）：

```
low poly portrait, geometric triangulated facets, flat shading,
each triangle one solid flat color, sharp crisp polygon edges,
no gradient, no smooth blending, faceted planes as skin and hair,
limited palette, flat dark gray background, half body bust, 4:5,
+ 灯光词（同上表）
```
```
photo, photorealistic skin texture, smooth gradient, soft shading, airbrush,
blur, noise, painterly, 3d render, watermark, text, deformed eyes, distorted face
```

---

## 四、后处理收尾（必做）

```powershell
.\tools\normalize.ps1 -In .\AI输出 -Out .\assets -Names act1.png,act2.png,act3.png,act4.png -Quality Png
```

输出保证：**同一尺寸、同一格式、EXIF 方向已修正、不拉伸变形**。
第一张验证过：3000×4000 / 1600×900 / 900×1500 三种输入 → 全部 1024×1280 PNG。

---

## 五、最省事、也最稳的一条路

**只让 AI 出 1 张基准低多边形图**，四幕的差异交给页面自己做：

- 页面已经内置四套氛围层：`--warm`（金）、`--alarm`（红警 + 震动 + 褪色）、`--night`（冷蓝台灯）、`--rain`（金色雨）。
- 一张图 + 四套氛围 = **风格 100% 一致、尺寸 100% 一致、绝不会出现"四个人"**。

想要零 AI：`poly.html` 用真照片直接算低多边形脸，一键导出四幕，天生一致。

---

## 六、踩坑对照表

| 现象 | 原因 | 解法 |
| --- | --- | --- |
| 4 张尺寸不同 | 平台不固定输出尺寸 | 跑 `normalize.ps1` |
| 风格飘（有的像照片） | denoise 太低 / LoRA 权重低 | denoise 提到 0.5，LoRA 0.8 |
| 脸不像、变人 | 用了文生图 / denoise 太高 / CFG 过高 | 改 img2img，denoise 0.45 |
| 每张人物位置不同 | 输入构图不同 | 先统一裁 4:5，再加 ControlNet |
| 背景花花绿绿 | 没约束背景 | prompt 里固定 `flat dark gray background`，或用 `poly.html` 的背景压平 |
| 面片碎成噪点 | 面片密度太高 | 加 `large simple facets, low facet count` |

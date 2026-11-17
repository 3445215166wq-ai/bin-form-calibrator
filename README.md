# bin 氏滑动变阻器

**简体中文** | [English](README.en.md)

拖动滑片，调节今日 bin 度。七档：
**格温 → bin 大小姐 → 稚嫩 bin 哥 → 先锋赛 FMVP → 反思后成熟的 bin → 夺冠！意气风发！ → 贾科斯**

单文件静态站：`index.html` + `assets/`，零依赖、不联网、无构建。

> **在线试玩**：https://binform-d0g0vgl1rde2f7fde-1533757942.tcloudbaseapp.com/

## 这有什么好玩的

- **视频擦洗（video scrubbing）**：滑块位置按锚点做分段线性插值映射到 `currentTime`，`seeked` 后把那一帧 `drawImage` 进 canvas —— 所以是"拖动即变形"，不是切图
- **七个刻度本身是一排按钮**：热区宽度铺满自己那一段，点哪跳哪，不会按偏；点完滑片用 CSS 过渡追过去，一开始拖动就摘掉过渡保持跟手
- **一键分享**：生成 900×1200 金框分享图 + 可复制的深链；右下角二维码**是页面内现算的**（内联了一个手写的 QR 编码器：Reed-Solomon / 格式信息 / 自动挑掩码，零依赖零网络，画进 canvas 不污染画布）
- **音效几乎全部合成**：普通档是音阶；最后一档是**共振峰合成**的"圣光啊——"（锯齿声带 + 颤音 + 三个元音共振峰 + 自造 IR 混响）。全站只有一个音频文件（59KB）——**「先锋赛 FMVP」「夺冠」「贾科斯」三档加入的真·体育馆人声**（CC BY-SA 4.0，署名见 `LICENSE-ASSETS`）
- **彩蛋**：敲 `bin` 或长按标题 0.7 秒；手机端有震动反馈（`navigator.vibrate`，无开关）

## 快速开始

```powershell
# 方式一：直接双击 index.html —— 能玩，但 file:// 下 canvas 被判跨源、导不出分享图
# 方式二：起本地服务器（推荐，分享图/二维码都正常）
node tools/serve.js 8099      # 打开 http://127.0.0.1:8099/
```

自己部署（任选静态托管）：

```powershell
powershell -NoProfile -File tools/build-dist.ps1    # 产出 dist/（约 7.5MB，只含运行必需）
tcb hosting deploy ./dist / -e <你的 CloudBase 环境ID>
```

repo 里已带 GitHub Actions（`.github/workflows/pages.yml`）：push 到 `main` 会自动打包并发到 GitHub Pages，
只需在仓库 **Settings → Pages → Source** 里选一次 **GitHub Actions**。

## 版权与免责

- **代码**：MIT，见 `LICENSE`
- **素材**（`assets/` 下的图片与视频）：**不在 MIT 范围内**，仅限个人学习交流、禁止商用，见 `LICENSE-ASSETS`
- 素材由 AI 生成，其中人物为真实公众人物、游戏角色形象权利归 Riot Games 所有；**本项目与选手本人及所属战队无关**
- 想复用代码：**删掉 `assets/` 换成你自己的素材**即可 —— `index.html` 顶部的 `TIERS` 数组改一下路径就能跑

## 目录结构

```
index.html            # 整个应用（单文件，含手写的二维码编码器）
assets/               # 运行必需的素材，一个不多
  evolution.mp4       # 拼好的七档演变视频（720×960 / 24fps / 24.9s / 4.81MB）
  crowd.mp3           # 体育馆现场人声（59KB，CC BY-SA 4.0）
  opt/                # 7 档压缩静帧（?img=1 兜底模式用）
  frames/             # 11 张帧序列（?frames=1 兜底模式用）
  share.png           # OG 封面（1200×630）
  skin-gwen.jpg / skin-jax.jpg
tools/                # 打包脚本 + 一堆 CDP 验证脚本（浏览器端行为靠它们回归）
old/                  # 旧原型与原始素材归档，已 gitignore，不参与构建
docs/                 # 拍摄稿与上传计划，已 gitignore
```

`old/` 里是历史包袱，**不删只归档**：早期原型（`v1-rheostat.html` / `poly.html` / `acts.html`）、
旧版打包产物、大体积原始素材（`old/source-assets/`，5 张原始 PNG + 5 段源视频，共 11.2MB）。
需要重新压素材时：`powershell -File tools/optimize.ps1 -In ".\old\source-assets" -Out ".\assets\opt"`。

---

## 线上地址

**https://binform-d0g0vgl1rde2f7fde-1533757942.tcloudbaseapp.com/**

- 托管：**腾讯云开发 CloudBase 静态网站托管**
- 环境：`binform-d0g0vgl1rde2f7fde`（地域 ap-shanghai，体验版免费，3000 资源点/月，到期 2027-05-16）
- 默认域名是腾讯已备案的 `*.tcloudbaseapp.com`，**国内可直连，不需要自己备案**
- GitHub Pages 镜像：**https://3445215166wq-ai.github.io/bin-form-calibrator/**（push 到 `main` 自动部署，海外访问用这个）
- Netlify 镜像：`https://illustrious-praline-5f50b9.netlify.app`（手动拖 `dist` 更新，注意它不会自动跟随仓库）

### 改完怎么发布

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-dist.ps1
tcb hosting deploy ./dist / -e binform-d0g0vgl1rde2f7fde
```

首次使用需要 `tcb login`（设备码授权）和 `tcb env use <envId>`。

**发布后必须核对字节数**——`tcb hosting deploy` 打过一屏 √ 也可能没真的换文件：

```powershell
(Get-Item dist\index.html).Length                                      # 本地
curl.exe -sS -o NUL -w "%{size_download}`n" https://<域名>/             # 线上
```

两个数一致才算上线。

---

## 本地怎么玩

| 方式 | 说明 |
| --- | --- |
| 双击 `index.html` | 能拖能玩，但 **`file://` 下 canvas 被判跨源，分享图导不出来**（会退回存该档静帧） |
| `node tools/serve.js 8099` → `http://127.0.0.1:8099/` | 推荐，分享图/二维码都能正常导出 |

### URL 参数

| 参数 | 作用 |
| --- | --- |
| `?t=N` | 直达第 N 档（1 起）。默认停在 `START_TIER = 2`（稚嫩 bin 哥） |
| `?p=0~1` | 按比例定位 |
| `?v=xxx.mp4` | 换一个视频文件（会去 `VIDEO_ANCHORS` 查锚点表） |
| `?frames=1` | 强制帧序列模式（`assets/frames/*.jpg`） |
| `?img=1` | 强制七张静帧模式（`assets/opt/*.jpg`） |

---

## 素材是怎么拼的

`assets/evolution.mp4`：**720×960 / 24fps / 24.88s / 597 帧 / 4.81MB**（crf 29，关键帧间隔 6 帧）。
五段**直接 concat、不加任何溶解**，切口都选在两边状态一致的位置：

- `视频5.mp4` 取满（720×1280 竖版，需 `crop=720:960:0:96`）：格温 → bin 大小姐
- `视频 (1).mp4` 保留 `0~2.70s`：它自己"先锋赛→黑衣服"的原生过渡在 2.36~2.49s，**完整保留**
- `视频2.mp4` 取满：黑外套 → 换回队服 → 举杯
- `视频3.mp4` 取满：举杯 → 手臂暴涨（爆衣铺垫）
- `视频4.mp4` 取满：爆衣 → 变身贾科斯

> **教训：不要用溶解去"伪造"本来就存在的过渡。** 切在"过渡刚开始"等于砍掉原生过渡再用 xfade 补，越补越不像。

### 实测镜头表（改锚点直接查这张表）

```
0–1.3 格温 / 1.2–1.4 溶解 / 1.4–4.4 大小姐 / 4.4–4.6 溶解（4.6 起已是男脸）
4.5–5.4 稚嫩（BLG 队服+耳机）/ 5.5–6.4 先锋赛（粉外套+金杯）/ 6.4–6.5 溶解
6.45–8.0 反思（黑外套抱臂）/ 8.1–9.2 换回队服 / 9.3–13.5 白外套双手捧杯
14–21 嘘手势且手臂渐粗（肌肉峰 18.5–21.0）/ 21–21.8 爆衣光爆 / 22.3–24.9 贾科斯
```

### 锚点与档位切换点

```js
VIDEO_ANCHORS = { "evolution.mp4": [0.10, 3.40, 5.20, 6.15, 6.85, 11.00, 24.60] }
SWITCH_OVERRIDE = { 4: 0.7269, 5: 0.97 };
```

- **锚点放在该档"最标准的那一帧"**。夺冠取的是 **11.00s 白外套笑开的那张**（9.45s 只是低头浅笑的，别用）
- 标签默认在**相邻两锚点中点**切换，所以锚点放歪＝把上一档的长镜头算进下一档
- 但有两处不能按中点切，用 `SWITCH_OVERRIDE` 钉死：
  - `4` 反思→夺冠 定在 8.35s（≈0.7269）：否则 8.4s 起"换回队服举杯"会漏回「反思」
  - `5` 夺冠→贾科斯 推到最后 3%（0.97）：夺冠素材有 13 秒，按中点切会把爆衣变身算成「贾科斯」；肌肉/爆衣应作为"变成贾科斯"的过渡
- **改锚点必须重算 0.7269**，改完跑 `node tools/cdp-switch.js 9333 <地址> _v/tail` 复核
- 唯一入口是 `tierForP(p)`：标签、弹幕、分享图全走它（**别处再写一遍 `Math.round(p*(N-1))` 会导致改了不生效**）

---

## 功能

### 拖动与刻度

- 拖动 1:1 跟手，**松手不吸附**
- **七个刻度本身就是按钮**：热区宽度 `100/(N-1)%` 铺满自己那一段，无缝不重叠，不会按到隔壁
- 点击立刻跳档 + 粉色扩散圈 + 音效/震动；滑片用 `.rheostat.jumping .knob{transition:transform .26s}` 追过去，**一拖动就摘掉这个类**保持跟手
- 键盘：`← →` 拨动，`Home / End` 到头

### 外观与默认状态

- **浅色纸感主题**：暖白底 `#f6f4ef`，主色换成 **BLG 蓝粉渐变**（`#f0447f` → `#2d63e0`，左粉右蓝）。界面一律扁平——去掉了径向光晕背景、渐变旋钮、发光描边和内阴影，让 AI 生成的画面自己当重点
  - 渐变落在：标题「bin氏」、通电的电量条、当前档位名、选中的开关和「保存图片」按钮、滑片上的指示针；小号刻度数字与焦点框这种"渐变会糊成一团"的地方退到单色（蓝 `#2d63e0`），点击扩散圈用粉
  - 渐变文字走 `background-clip:text` + `@supports` 守卫，不支持的浏览器退回粉色实心，不会变成隐形字
- **四个按钮排成一行**：`↺ 复位` `📤 分享` `🔊 音效` `💬 弹幕`，一进页面就在首屏里
- **舞台高度跟着视口走**：`height: min(56dvh, 124vw, 520px)`；矮屏（≤720px 高）降到 48dvh、横屏再降到 42dvh，并隐藏脚注。旧版写死 `aspect-ratio:4/5`，小屏上四个按钮会被顶出屏幕，得滚动才看得见
- **默认状态：音效开、弹幕关**。用 `bs.pv` 做了版本迁移——老设备里残留的旧偏好会被清回默认值，保证"第一次进来"就是这个状态
- 档位标签从纯文字改成半透明胶囊，压在明亮的画面上也读得清
- **滑片是唯一的"动效彩蛋"**：一颗会慢慢转的银河球——深空底 + 粉/蓝/紫三团星云（`::before` 里 14s 转一圈）+ 白色核心亮点 + 几颗星点 + 边缘暗角做出球体纵深，顶上那根白针仍是指示针
  - 发光强度跟位置绑定：`--glow` 由 `render()` 按 `p²` 写入（量化到 0.05，避免拖动时每帧改 `box-shadow`），越往右外发光越亮；拉到 100% 加 `.full` 类，切换成 1.8s 呼吸光
  - 只有这一个元素带动画，实测拖动帧率没有变化（median 6.9ms / p95 7.3ms）
  - `prefers-reduced-motion` 下停转也停呼吸

### 分享（📤）

点一下弹**预览层**，确认后才保存：

- 上面是 **900×1200** 分享图：蓝粉渐变双线圆角边框 + 四角角标 + `BIN'S FORM CALIBRATOR` + 画面 + 「第 N 档」+ 渐变档位名 + quip + 域名 + **右下角二维码**
- 下面是可一键复制的 `?t=N` 深链
- 点「保存图片」才落盘；取消 / ✕ / Esc / 点背景都不下载
- **二维码是页面内现算的**（内联 `QRLib`，字节模式 / EC level M / 版本 1~6 / 自动挑掩码），零依赖零网络，画进 canvas 不会污染画布
- 字号按"手机缩放后仍看得清"定的：档位名 64px、正文 28~30px、辅助信息 20px、二维码 180px

### 音效 🔊 / 弹幕 💬 / 震动

- **音频总线**：所有声音先汇到一条总线 → **限幅器**（`DynamicsCompressor`，threshold -6 / knee 12 / ratio 6，只压峰值不压整体）→ 总音量 `1.0` → 输出
- **实测电平**（`node tools/cdp-level.js`，把 AnalyserNode 插在 destination 前面量）：

  | 声音 | 峰值 | RMS |
  | --- | --- | --- |
  | 普通档单音 | 0.13 | 0.011 |
  | 圣光「啊」 | **0.49** | 0.065 |
  | 现场人声 | 0.08 | 0.027 |

  → 圣光是明显的高潮（约普通档 3.8 倍峰值、6 倍能量），现场人声稳定在背景级（约圣光的 1/2.4 能量），叠加也不超 0.57，不会爆音
- **音效**：普通档是随档位升高的音阶；最后一档是**共振峰合成**的「圣光啊——」（锯齿声带 + 颤音 + 三个元音共振峰 + 自造 IR 混响），全部 WebAudio 现场合成。**「先锋赛 FMVP」「夺冠」「贾科斯」三档会加入一片真·体育馆人声**（`assets/crowd.mp3`，CC BY-SA 4.0，59KB）。
  - **人声"啊"用共振峰合成**：三段锯齿波声带（F3 / A3 / C4，都挂 5.2Hz 颤音）→ 三个并联带通共振峰 `F1 730 Q7 / F2 1090 Q9 / F3 2440 Q11`（元音 /a/ 的频谱包络）→ 干声 + 混响
  - 底下垫一层轻正弦和弦（F4 / C5）给厚度，顶上叠 1568 / 2093Hz 缓慢上扬的闪光；全长 2.2s
  - **混响是常驻总线**（`reverbBus`，自造 2.4s 噪声 IR，`normalize = true`，湿声 0.4）。⚠️ 以前每次播放都往同一个缓存卷积节点挂一条新的湿声通路，连接会累加 → **"声音越来越大"**；现在每次只是往常驻总线的输入端送信号，增益只算一次
- **现场人声只在"拿杯"的那几档响**：拖到「先锋赛 FMVP」「夺冠」或「贾科斯」时（`CROWD_TIERS = [3, 5, 6]`），1.1 秒淡入一片真·体育馆人声（`assets/crowd.mp3`，取自 NFL 箭头体育场现场录音，CC BY-SA 4.0，循环播放，`CROWD_VOL = 0.22`）；离开这些档位立刻淡出
  - **为什么不用合成的**：早期版本用带通噪声+LFO 做了"人声鼎沸"，用户反馈"只是大海声"——低频能量占主导，实测 mid(300~1000Hz) 比 low 低 12.8dB，听起来就是海浪；换成真实录音后 mid 反超 low 12.8dB、RMS 变异系数 0.26（有起伏才像人声）。**挑素材的判据就这两条**
  - 也不是全程底噪：只在拿杯的档位响，普通档干净
- **弹幕**：默认关闭。七种样式混飞 —— 普通描边 / 霓虹发光 / 胶囊标签 / 硬描边 / 边飞边抖 / 顶部停留 / 居中大字幕；10 色池、三档速度、同屏上限 22 条、越往后档位越挤
- **震动**：没有开关，一直有（安卓有效；iOS Safari 不支持 `navigator.vibrate`）
- 音效是总开关：🔊 关掉连现场人声一起停

### 隐藏档（彩蛋）

键盘敲 `bin`，或**长按标题 0.7 秒** → 弹「MSI 那一波硬越塔」：暗红褪色画面 + 骂声弹幕 + 低频音效，5.2 秒自动收。进彩蛋会清掉残留的正常弹幕，骂声只用抖/胶囊/发光/描边四种样式，不盖字幕。

---

## 关键技术决策与踩过的坑

**视频拖动**

- **不要切 visibility**：切了浏览器会丢弃已光栅化的纹理，切档必顿一下
- **只用 transform**：滑片 `translate3d`、高光条 `scaleX`，全程不碰 layout
- **视频按 cover 裁切**：3:4 的视频塞进 4:5 舞台不能拉伸，否则人脸歪
- **seek 要能重试**：`readyState` 没到就 `return` 会让这一帧永久丢失（画面停在空白），必须重新排队
- **`seeked` 回来必须"先同步画完，再排下一次 seek"**。以前这里要求"落点等于当前目标"才画，快速拖动时目标一直在跑 → **一帧都不画，画面冻住、松手才一下跳过去**。改成每次落地都画，实测快拖 350ms 内从 0 帧变成 15 帧（间隔 10~25ms）
- 绘制顺序还有个坑：如果在同一个任务里先发起下一次 seek 再画，`readyState` 已掉回 1，会被 `drawVideoFrame` 的 `readyState < 2` 守卫挡掉 → **又变成 0 帧**
- 加了 `seekWatchdog`（500ms）：万一某次 `seeked` 没来，不能让画面永久卡死

**交互**

- 刻度容器 `.stops` 必须 `pointer-events:none`、只有按钮 `auto`，否则空白处的点击被容器吃掉，拖不动滑条
- 同类动作合并成一个按钮：存图 / 分享 / 海报 三个入口合成一个「分享」；砍功能要连入口一起删干净
- 有副作用的动作（下载）先给预览再让用户确认

**部署与工程**

- `tcb hosting deploy` 的成功输出**不是**验证，要核对线上/本地字节数（详见上文）
- **不要用 PowerShell 的 `Get-Content | -replace | Set-Content` 改含中文的 UTF-8 文件**——本仓库的 README 就是这么被写成乱码的（UTF-8 字节被按 CP936 解码，问号替换不可逆）。要么用编辑工具，要么用 Node 读写
- CDP 合成点击时 `Input.dispatchMouseEvent` 的 `mouseReleased` 必须写 `button:"left", buttons:0`；写成 `button:"none"` 这次释放会被丢掉，`click` 永远不触发
- headless 视口可能只有两三百像素高，视口外的坐标点不到东西，测试前先 `window.scrollBy`

---

## 工具脚本

| 脚本 | 用途 |
| --- | --- |
| `tools/build-dist.ps1` | 打包 `dist/`（只挑运行必需，约 7.6MB / 22 文件） |
| `tools/build-zip.ps1` | 打 `dist.zip`（正斜杠条目，校验反斜杠/非 ASCII/index.html 在根） |
| `tools/serve.js` | 本地静态服务器：`node tools/serve.js 8099` |
| `tools/cdp-perf.js` | 拖动帧率（中位/p95/掉帧数） |
| `tools/cdp-grid.js` | 逐格截图：13 个滑块位置的秒数 + 档名 |
| `tools/cdp-switch.js` | 档位切换点复核（改锚点后必跑） |
| `tools/cdp-stops.js` | 七个刻度点击是否精确落档 |
| `tools/cdp-sheet.js` / `cdp-sheet3.js` | 分享预览流程（不自动下载 / 取消 / 保存 / Esc） |
| `tools/cdp-card.js` | 按原分辨率导出分享图，检查排版 |
| `tools/cdp-qrcheck.js` | 在页面里用 jsQR 反解二维码，确认扫得出来 |
| `tools/cdp-scrub2.js` / `cdp-scrub3.js` | 快拖诊断（seek 次数 / 实际绘制帧数 / 间隔） |
| `tools/cdp-smoke.js` | 打包结果冒烟 |
| `tools/qr-encoder.js` | 二维码编码器独立版，可被别的项目 require |
| `tools/qr-verify.js` | 用它生成图、再用 jsQR 反解，6 个用例回归 |
| `tools/qr-diff.js` / `qr-diff2.js` | 与 npm `qrcode` 逐模块 / 逐码字对拍（定位 bug 用） |

素材处理：`tools/optimize.ps1`（压静帧）、`tools/normalize.ps1`（统一尺寸）、`tools/make-video.ps1`（拼 `evolution.mp4`）、`tools/make-cover.ps1`（OG 图）、`tools/make-crowd-audio.js`（剪现场人声 + 测中低频占比与 RMS 起伏）。

> `tools/` 里还有二十来个一次性的诊断脚本（`cdp-danmu*.js` / `cdp-poster.js` / `cdp-audio*.js` / `cdp-hitdiag.js` …），
> 都是调某一版 UI 时写的，留着当排查参照，日常回归只用上表那几个。
> 视频探测、帧序列导出这类一次性脚本已归档到 `old/`。

---

## 已知限制

- **iOS Safari 不支持震动**
- 分享图里的二维码是烧进像素的死图：**换域名后旧图里的码会失效**，需要重新分享
- 浏览器/微信对 `*.tcloudbaseapp.com` 这类共享托管域名会弹"未经验证/非微信官方网页"提示，点「继续访问」即可；想彻底消除只能绑自有已备案域名
- 档位间仍有 0.2~0.6 秒的过渡区会出现"画面还在上一档"，这是长短镜头挤进等分滑块的结构性误差
- `file://` 打开时 canvas 被判跨源，分享图导不出（退回存该档静帧）

# 批量统一图片尺寸 / 格式

把任意尺寸、任意格式的图，统一裁成固定的 `宽×高` PNG。
用于「AI 出图尺寸不固定」这个问题：**风格交给 AI，尺寸交给这个脚本。**

## 用法

```powershell
# 把 素材原图/ 里的所有图 → 输出到 assets/，统一 1024×1280 PNG
powershell -ExecutionPolicy Bypass -File .\tools\normalize.ps1 -In .\素材原图 -Out .\assets

# 指定尺寸（默认 1024×1280 = 4:5）
.\tools\normalize.ps1 -In .\素材原图 -Out .\assets -Width 1280 -Height 1600

# 严格按顺序改名成 act1~act4（按文件名排序）
.\tools\normalize.ps1 -In .\素材原图 -Out .\assets -Names act1.png,act2.png,act3.png,act4.png

# 裁切位置上移（默认 0.42 偏上，人脸不容易被切下巴）
.\tools\normalize.ps1 -In .\素材原图 -Out .\assets -Bias 0.30
```

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `-In` | 必填 | 输入文件夹 |
| `-Out` | `.\assets` | 输出文件夹（不存在会自动创建） |
| `-Width` `-Height` | 1024 / 1280 | 输出尺寸，必须 4:5 才和页面舞台比例一致 |
| `-Bias` | 0.42 | 只在高图裁切时生效：0=留顶部，0.5=居中，1=留底部 |
| `-Names` | 无 | 逗号分隔的输出文件名，按输入排序依次套用 |
| `-Quality` | Png | `Png`（无损，推荐）或 `Jpeg` |

## 行为

- 支持 `png` / `jpg` / `jpeg`；`webp` 会提示失败（.NET GDI+ 不支持，用任一转换工具先转成 png）。
- 自动读 EXIF 方向（手机竖拍的照片不会躺倒）。
- 宽图裁左右、高图裁上下，**不拉伸变形**，高质量 bicubic 重采样。
- 原文件不覆盖，输出统一小写扩展名。

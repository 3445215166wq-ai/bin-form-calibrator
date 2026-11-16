[CmdletBinding()]
param(
  [string]$Config = ".\tools\share-cover.json"
)

# Build the 1200x630 share / OG cover image.
# All display strings (including CJK) live in share-cover.json and are read as UTF-8,
# so this script stays pure ASCII: Windows PowerShell mangles CJK literals inside .ps1.

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$cfg = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $Config).Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$W = [int]$cfg.width
$H = [int]$cfg.height

$bmp = [System.Drawing.Bitmap]::new($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$g.Clear([System.Drawing.ColorTranslator]::FromHtml($cfg.bg))

# portrait on the right, scaled to full height
$img = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $cfg.portrait).Path)
$ph = $H
$pw = [int]($img.Width * ($ph / $img.Height))
$px = $W - $pw - [int]$cfg.portraitRightPad
$g.DrawImage($img, [System.Drawing.Rectangle]::new($px, 0, $pw, $ph))

# dark gradient on the left so text stays readable
$rect = [System.Drawing.Rectangle]::new(0, 0, [int]($W * 0.72), $H)
$brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
  $rect,
  [System.Drawing.Color]::FromArgb(255, 11, 13, 19),
  [System.Drawing.Color]::FromArgb(0, 11, 13, 19),
  [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal)
$g.FillRectangle($brush, $rect)

function New-Font([string[]]$names, [float]$size, [System.Drawing.FontStyle]$style) {
  foreach ($n in $names) {
    try {
      $f = [System.Drawing.Font]::new($n, $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
      if ($f) { return $f }
    } catch { }
  }
  return [System.Drawing.Font]::new("Arial", $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

$cjk = @("Microsoft YaHei", "Microsoft YaHei UI", "SimHei", "Noto Sans CJK SC")
$fontTitle  = New-Font $cjk 52 ([System.Drawing.FontStyle]::Bold)
$fontSub    = New-Font $cjk 22 ([System.Drawing.FontStyle]::Regular)
$fontChain  = New-Font $cjk 17 ([System.Drawing.FontStyle]::Regular)
$fontSmall  = New-Font $cjk 14 ([System.Drawing.FontStyle]::Regular)
$fontKicker = New-Font @("Arial", "Segoe UI") 15 ([System.Drawing.FontStyle]::Bold)

$white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(240, 238, 243, 255))
$gold  = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 255, 202, 77))
$muted = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(230, 130, 148, 180))

$g.DrawString($cfg.kicker, $fontKicker, $muted, 72, 148)
$g.DrawString($cfg.title, $fontTitle, $white, 70, 180)
$g.DrawString($cfg.subtitle, $fontSub, $white, 72, 268)

$goldPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 255, 202, 77), 3)
$g.DrawLine($goldPen, 74, 330, 240, 330)
$g.DrawString($cfg.chain, $fontChain, $gold, 72, 348)
$g.DrawString($cfg.footer, $fontSmall, $muted, 72, 540)

$g.Dispose()
$img.Dispose()

$outPath = Join-Path (Get-Location) $cfg.out
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

$f = Get-Item -LiteralPath $outPath
Write-Host ("OK -> {0} ({1:N0} KB, {2}x{3})" -f $f.FullName, ($f.Length / 1KB), $W, $H) -ForegroundColor Green

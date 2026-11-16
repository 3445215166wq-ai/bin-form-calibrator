[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Video,
  [string[]]$Sources = @("assets\opt\0.jpg", "assets\opt\1.jpg", "assets\opt\2.jpg", "assets\opt\3.jpg", "assets\opt\4.jpg"),
  [double]$Fps = 10,
  [string]$Ffmpeg = "ffmpeg"
)

# Find WHEN each reference image appears in a user-supplied transition video.
# Compares 16x20 grayscale thumbnails (L2) between every sampled video frame and
# each source image, then reports the best matching time per source.
# Pure ASCII on purpose: Windows PowerShell mangles CJK literals inside .ps1.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$SW = 16; $SH = 20
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("probe_" + [guid]::NewGuid().ToString("N").Substring(0, 8))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

function Get-Signature($path) {
  $src = [System.Drawing.Image]::FromFile($path)
  $bmp = $null
  try {
    $bmp = [System.Drawing.Bitmap]::new($SW, $SH)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $tar = $SW / $SH
    $sw = $src.Width; $sh = $src.Height
    if (($sw / $sh) -gt $tar) { $cw = [int]($sh * $tar); $ch = $sh; $sx = [int](($sw - $cw) / 2); $sy = 0 }
    else { $cw = $sw; $ch = [int]($sw / $tar); $sx = 0; $sy = [int](($sh - $ch) * 0.45) }
    $g.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, $SW, $SH),
                 [System.Drawing.Rectangle]::new($sx, $sy, $cw, $ch), [System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()

    # LockBits 一次性拷贝，避免逐像素 GetPixel（慢且易越界）
    $rect = [System.Drawing.Rectangle]::new(0, 0, $bmp.Width, $bmp.Height)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                          [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $len = [math]::Abs($data.Stride) * $bmp.Height
    $bytes = New-Object 'byte[]' $len
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $bytes, 0, $len)
    $stride = [math]::Abs($data.Stride)
    $bmp.UnlockBits($data)

    $arr = New-Object 'double[]' ($SW * $SH)
    $i = 0
    for ($y = 0; $y -lt $SH; $y++) {
      $row = $y * $stride
      for ($x = 0; $x -lt $SW; $x++) {
        $o = $row + $x * 3
        $arr[$i] = (0.114 * $bytes[$o] + 0.587 * $bytes[$o + 1] + 0.299 * $bytes[$o + 2]) / 255.0
        $i++
      }
    }
    return $arr
  } finally {
    if ($bmp) { $bmp.Dispose() }
    $src.Dispose()
  }
}

function Get-Distance($a, $b) {
  $s = 0.0
  for ($i = 0; $i -lt $a.Length; $i++) { $d = $a[$i] - $b[$i]; $s += $d * $d }
  return [math]::Sqrt($s / $a.Length)
}

Write-Host "Extracting frames at $Fps fps ..." -ForegroundColor Cyan
& $Ffmpeg -loglevel error -y -i $Video -vf "fps=$Fps,scale=160:-2" -q:v 4 (Join-Path $tmp "f%04d.jpg")
$frames = @(Get-ChildItem $tmp -Filter "f*.jpg" | Sort-Object Name)
if ($frames.Count -eq 0) { throw "frame extraction failed" }

$sigs = @()
foreach ($s in $Sources) { $sigs += , (Get-Signature $s) }

$rows = New-Object System.Collections.ArrayList
$bestPer = @{}
for ($k = 0; $k -lt $sigs.Count; $k++) { $bestPer[$k] = @{ dist = [double]::MaxValue; t = -1 } }

$idx = 0
foreach ($f in $frames) {
  $t = $idx / $Fps
  $sig = Get-Signature $f.FullName
  $best = 0; $bestD = [double]::MaxValue
  for ($k = 0; $k -lt $sigs.Count; $k++) {
    $d = Get-Distance $sig $sigs[$k]
    if ($d -lt $bestD) { $bestD = $d; $best = $k }
    if ($d -lt $bestPer[$k].dist) { $bestPer[$k] = @{ dist = $d; t = $t } }
  }
  [void]$rows.Add([pscustomobject]@{ t = $t; best = $best; dist = [math]::Round($bestD, 4) })
  $idx++
}

# 只打印"最佳匹配发生变化"的时刻，砍掉一大片重复
$prev = -1
foreach ($r in $rows) {
  if ($r.best -ne $prev) {
    Write-Host ("t={0,5:N1}s  ->  state #{1}   (dist {2})" -f $r.t, $r.best, $r.dist)
    $prev = $r.best
  }
}

Write-Host ""
Write-Host "Best frame per source image:" -ForegroundColor Cyan
for ($k = 0; $k -lt $sigs.Count; $k++) {
  Write-Host ("  state #{0}: t = {1:N2}s   (dist {2:N4})" -f $k, $bestPer[$k].t, $bestPer[$k].dist)
}
$anchors = ($(0..($sigs.Count - 1) | ForEach-Object { "{0:N2}" -f $bestPer[$_].t }) -join ", ")
Write-Host ""
Write-Host ("ANCHORS = [{0}]" -f $anchors) -ForegroundColor Green

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

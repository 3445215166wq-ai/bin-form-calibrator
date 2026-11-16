[CmdletBinding()]
param(
  [string]$In = ".\assets",
  [string]$Out = ".\assets\opt",
  [string]$MapFile = ".\tools\tiers.json",
  [int]$Width = 900,
  [int]$Height = 1125,
  [int]$Quality = 86
)

# Downscale the tier images so dragging stays at 60fps.
# The reference project ships ~35KB frames; we were compositing 2-3MB PNGs.
# NOTE: file names live in tiers.json (read as UTF-8) so this script stays pure
# ASCII -- Windows PowerShell would mangle CJK literals inside a .ps1.

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $In)) { throw "Input folder not found: $In" }
if (-not (Test-Path -LiteralPath $Out)) { New-Item -ItemType Directory -Force -Path $Out | Out-Null }

$raw = [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $MapFile).Path, [System.Text.Encoding]::UTF8)
$parsed = $raw | ConvertFrom-Json
$entries = @()
if ($parsed -is [System.Array]) { $entries = $parsed } else { $entries += $parsed }
"entries: {0}" -f $entries.Count

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)

$done = @{}
$totalBefore = 0
$totalAfter = 0

foreach ($m in $entries) {
  if ($done.ContainsKey($m.dst)) { continue }
  $path = Join-Path $In $m.src
  if (-not (Test-Path -LiteralPath $path)) { continue }

  $src = $null; $bmp = $null; $g = $null
  try {
    $src = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $path).Path)
    $bmp = [System.Drawing.Bitmap]::new($Width, $Height)
    $bmp.SetResolution(96, 96)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, $Width, $Height))
    $g.Dispose(); $g = $null

    $dstPath = Join-Path $Out $m.dst
    $bmp.Save($dstPath, $codec, $encParams)

    $b = (Get-Item -LiteralPath $path).Length
    $a = (Get-Item -LiteralPath $dstPath).Length
    $totalBefore += $b
    $totalAfter += $a
    $done[$m.dst] = $true
    "{0,-24} {1,7:N0} KB  ->  {2}  {3,5:N0} KB" -f $m.dst, ($b / 1KB), $m.dst, ($a / 1KB)
  } catch {
    "FAIL {0}: {1}" -f $m.src, $_.Exception.Message
  } finally {
    if ($g) { $g.Dispose() }
    if ($bmp) { $bmp.Dispose() }
    if ($src) { $src.Dispose() }
  }
}

""
"{0} x {1} JPEG q{2} -> {3}" -f $Width, $Height, $Quality, (Resolve-Path -LiteralPath $Out).Path
if ($totalAfter -gt 0) {
  "total {0:N1} MB -> {1:N0} KB  ({2:N1}x smaller)" -f ($totalBefore / 1MB), ($totalAfter / 1KB), ($totalBefore / $totalAfter)
}

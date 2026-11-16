[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$In,
  [string]$Out = ".\assets",
  [int]$Width = 1024,
  [int]$Height = 1280,
  [double]$Bias = 0.42,
  [string[]]$Names,
  [ValidateSet("Png", "Jpeg")][string]$Quality = "Png"
)

# Batch-normalize images to a fixed size / format.
# Style is the AI's job; exact pixel size and format are this script's job.

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $In)) { throw "Input folder not found: $In" }
if (Test-Path -LiteralPath $Out) {
  $OutFull = (Resolve-Path -LiteralPath $Out).Path
} else {
  $OutFull = (New-Item -ItemType Directory -Force -Path $Out).FullName
}

$files = @(Get-ChildItem -LiteralPath $In -File |
  Where-Object { $_.Extension -imatch '^\.(png|jpe?g)$' } |
  Sort-Object Name)

if ($files.Count -eq 0) { throw "No png/jpg found in $In" }

$webp = @(Get-ChildItem -LiteralPath $In -File | Where-Object { $_.Extension -imatch '^\.webp$' })
if ($webp.Count -gt 0) {
  Write-Warning ("Skipping webp (GDI+ cannot decode it): " + (($webp | ForEach-Object { $_.Name }) -join ", "))
}

if ($Quality -eq "Png") {
  $fmt = [System.Drawing.Imaging.ImageFormat]::Png
  $ext = ".png"
} else {
  $fmt = [System.Drawing.Imaging.ImageFormat]::Jpeg
  $ext = ".jpg"
}
$targetAR = $Width / $Height

$rows = New-Object System.Collections.ArrayList
$i = 0

foreach ($f in $files) {
  if ($Names -and $i -lt $Names.Count) {
    $name = $Names[$i]
    if (-not $name.ToLower().EndsWith($ext)) {
      $name = [System.IO.Path]::GetFileNameWithoutExtension($name) + $ext
    }
  } else {
    $name = [System.IO.Path]::GetFileNameWithoutExtension($f.Name) + $ext
  }
  $i++

  $src = $null
  $bmp = $null
  $gfx = $null
  $ms = $null
  try {
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $ms = New-Object System.IO.MemoryStream(, $bytes)
    $src = [System.Drawing.Image]::FromStream($ms)

    # EXIF orientation (phone portrait shots)
    try {
      if ($src.PropertyIdList -contains 0x0112) {
        $o = [int]$src.GetPropertyItem(0x0112).Value[0]
        if ($o -eq 3) { $src.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
        elseif ($o -eq 6) { $src.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
        elseif ($o -eq 8) { $src.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
      }
    } catch { }

    $sw = $src.Width
    $sh = $src.Height
    $srcAR = $sw / $sh

    if ($srcAR -gt $targetAR) {
      $cropH = $sh
      $cropW = [int][math]::Round($sh * $targetAR)
      $sx = [int](($sw - $cropW) / 2)
      $sy = 0
    } else {
      $cropW = $sw
      $cropH = [int][math]::Round($sw / $targetAR)
      $sx = 0
      $sy = [int](($sh - $cropH) * $Bias)
    }
    if ($cropW -lt 1) { $cropW = 1 }
    if ($cropH -lt 1) { $cropH = 1 }
    if ($sx -lt 0) { $sx = 0 }
    if ($sy -lt 0) { $sy = 0 }

    $bmp = [System.Drawing.Bitmap]::new($Width, $Height)
    $bmp.SetResolution(96, 96)
    $gfx = [System.Drawing.Graphics]::FromImage($bmp)
    $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $gfx.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $gfx.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $dest = [System.Drawing.Rectangle]::new(0, 0, $Width, $Height)
    $srcRect = [System.Drawing.Rectangle]::new($sx, $sy, $cropW, $cropH)
    $gfx.DrawImage($src, $dest, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $gfx.Dispose()
    $gfx = $null

    $outPath = Join-Path $OutFull $name
    $bmp.Save($outPath, $fmt)

    [void]$rows.Add([pscustomobject]@{
      Source = $f.Name
      InSize = "$sw x $sh"
      Crop   = "$cropW x $cropH @ $sx,$sy"
      Out    = $name
      Status = "OK"
    })
  } catch {
    [void]$rows.Add([pscustomobject]@{
      Source = $f.Name; InSize = "-"; Crop = "-"; Out = "-"; Status = ("FAIL: " + $_.Exception.Message)
    })
  } finally {
    if ($gfx) { $gfx.Dispose() }
    if ($bmp) { $bmp.Dispose() }
    if ($src) { $src.Dispose() }
    if ($ms) { $ms.Dispose() }
  }
}

$rows | Format-Table -AutoSize
$ok = @($rows | Where-Object { $_.Status -eq "OK" }).Count
Write-Host ""
Write-Host ("Done: {0} / {1} -> {2}  ({3} x {4}, {5})" -f $ok, $rows.Count, $OutFull, $Width, $Height, $Quality) -ForegroundColor Green

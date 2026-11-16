[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$In,
  [string]$Out = ".\assets\evolution.mp4",
  [int]$Width = 896,
  [int]$Height = 1120,
  [int]$Fps = 30,
  [int]$Crf = 23,
  [string]$Ffmpeg = "ffmpeg"
)

# Join the per-segment transition clips (produced by an image-to-video model
# with first/last frame) into ONE video that index.html scrubs.
# -g 1 => every frame is a keyframe, so seeking to any point is a single decode
#         (this is what makes slider scrubbing feel instant).
# Keep this file pure ASCII: Windows PowerShell mangles CJK literals in .ps1.

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $In)) { throw "Input folder not found: $In" }

$clips = @(Get-ChildItem -LiteralPath $In -File |
  Where-Object { $_.Extension -imatch '^\.(mp4|mov|webm|mkv)$' } |
  Sort-Object Name)

if ($clips.Count -eq 0) { throw "No video clips found in $In" }
Write-Host ("Joining {0} clip(s):" -f $clips.Count) -ForegroundColor Cyan
$clips | ForEach-Object { Write-Host ("  " + $_.Name) }

$args = @("-loglevel", "error", "-y")
foreach ($c in $clips) { $args += @("-i", $c.FullName) }

$pads = ($(0..($clips.Count - 1) | ForEach-Object { "[{0}:v]" -f $_ }) -join "")
$filter = "$pads" + "concat=n=$($clips.Count):v=1:a=0," +
          "scale=$($Width):$($Height):force_original_aspect_ratio=increase," +
          "crop=$($Width):$($Height),setsar=1,fps=$Fps[v]"

$args += @(
  "-filter_complex", $filter, "-map", "[v]",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "1", "-crf", "$Crf",
  "-movflags", "+faststart", "-an", $Out
)

& $Ffmpeg @args
if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed with exit code $LASTEXITCODE" }
if (-not (Test-Path -LiteralPath $Out)) { throw "Output not created: $Out" }

$f = Get-Item -LiteralPath $Out
Write-Host ""
Write-Host ("OK -> {0}  ({1:N0} KB, {2}x{3}, all-intra)" -f $f.FullName, ($f.Length / 1KB), $Width, $Height) -ForegroundColor Green
Write-Host "Reload index.html: it switches to video mode automatically."

[CmdletBinding()]
param(
  [string]$Out = ".\dist"
)

# Assemble a slim, upload-ready folder: only what the page actually needs at runtime.
# Excluded on purpose: original big PNGs (~11MB, only used as ?img=1 fallback),
# the five source videos (~5MB), evolution-motion.mp4 (A/B compare only), tools/.

$ErrorActionPreference = "Stop"
$root = Get-Location
$dst = Join-Path $root $Out

if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dst | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dst "assets") | Out-Null

function Copy-IfExists([string]$rel) {
  $src = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $src)) { Write-Warning ("missing: " + $rel); return }
  $target = Join-Path $dst $rel
  $dir = Split-Path -Parent $target
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  Copy-Item -LiteralPath $src -Destination $target -Force
}

# entry
Copy-IfExists "index.html"

# core media
Copy-IfExists "assets/evolution.mp4"
Copy-IfExists "assets/share.png"
Copy-IfExists "assets/skin-gwen.jpg"
Copy-IfExists "assets/skin-jax.jpg"

# fallback stills (?img=1)
Get-ChildItem -LiteralPath (Join-Path $root "assets\opt") -File -Filter "*.jpg" -ErrorAction SilentlyContinue |
  ForEach-Object { Copy-IfExists ("assets/opt/" + $_.Name) }

# clean frames (?frames=1)
Get-ChildItem -LiteralPath (Join-Path $root "assets\frames") -File -Filter "*.jpg" -ErrorAction SilentlyContinue |
  ForEach-Object { Copy-IfExists ("assets/frames/" + $_.Name) }

# report
$files = Get-ChildItem -LiteralPath $dst -Recurse -File
$total = ($files | Measure-Object Length -Sum).Sum
Write-Host ""
Write-Host ("dist ready: {0} files, {1:N1} MB -> {2}" -f $files.Count, ($total / 1MB), $dst) -ForegroundColor Green
$files | Sort-Object Length -Descending | Select-Object -First 8 |
  ForEach-Object { Write-Host ("  {0,8:N1} MB  {1}" -f ($_.Length / 1MB), $_.FullName.Replace($dst + "\", "")) }

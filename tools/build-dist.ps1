[CmdletBinding()]
param(
  # Output directory name. Must be "dist" (a bare name), not ".\dist":
  # on Linux runners a backslash is a legal filename char, so ".\dist" would create
  # a directory literally named ".\dist".
  # Do NOT rename this to $Out: it collides with the common parameters
  # -OutVariable / -OutBuffer and causes AmbiguousParameter.
  [string]$Dest = "dist"
)

# Assemble a slim, upload-ready folder: only what the page actually needs at runtime.
# Excluded on purpose: original big PNGs (~11MB, only used as ?img=1 fallback),
# the five source videos (~5MB), evolution-motion.mp4 (A/B compare only), tools/.

$ErrorActionPreference = "Stop"
$root = (Get-Location).Path
if ([string]::IsNullOrWhiteSpace($Dest)) { throw "Dest must not be empty" }

$dst = Join-Path $root $Dest

# ---- Safety guard: target must be strictly inside the project root ----
# (Without this, a bad value could wipe the whole project.)
$rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\', '/')
$dstFull = [System.IO.Path]::GetFullPath($dst).TrimEnd('\', '/')
if ($dstFull -eq $rootFull) { throw "Refusing: target equals project root ($dstFull)" }
if (-not ($dstFull.StartsWith($rootFull + '\') -or $dstFull.StartsWith($rootFull + '/'))) {
  throw "Refusing: target is outside the project ($dstFull)"
}
Write-Host "target: $dstFull" -ForegroundColor DarkGray

if (Test-Path -LiteralPath $dstFull) { Remove-Item -LiteralPath $dstFull -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dstFull | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dstFull "assets") | Out-Null

function Copy-IfExists([string]$rel) {
  $src = Join-Path $root $rel
  if (-not (Test-Path -LiteralPath $src)) { Write-Warning ("missing: " + $rel); return }
  $target = Join-Path $dstFull $rel
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
# Always use forward slashes here: a backslash is a normal filename char on Linux
# runners, so "assets\opt" would not resolve there.
Get-ChildItem -LiteralPath (Join-Path $root "assets/opt") -File -Filter "*.jpg" -ErrorAction SilentlyContinue |
  ForEach-Object { Copy-IfExists ("assets/opt/" + $_.Name) }

# clean frames (?frames=1)
Get-ChildItem -LiteralPath (Join-Path $root "assets/frames") -File -Filter "*.jpg" -ErrorAction SilentlyContinue |
  ForEach-Object { Copy-IfExists ("assets/frames/" + $_.Name) }

# report
$files = Get-ChildItem -LiteralPath $dstFull -Recurse -File
$total = ($files | Measure-Object Length -Sum).Sum
Write-Host ""
Write-Host ("dist ready: {0} files, {1:N1} MB -> {2}" -f $files.Count, ($total / 1MB), $dstFull) -ForegroundColor Green
$files | Sort-Object Length -Descending | Select-Object -First 8 |
  ForEach-Object {
    $rel = $_.FullName.Substring($dstFull.Length).TrimStart('/', '\')
    Write-Host ("  {0,8:N1} MB  {1}" -f ($_.Length / 1MB), $rel)
  }

[CmdletBinding()]
param(
  [string]$Src = ".\dist",
  [string]$Out = ".\dist.zip"
)

# Zip the dist folder for one-click drag-and-drop uploading.
# Windows' Compress-Archive writes BACKSLASH entry names (assets\evolution.mp4),
# which many Linux-based hosts (EdgeOne Pages / Cloudflare Pages) reject as
# "invalid filename". So we build the archive by hand with forward slashes and
# verify every entry is ASCII-only before declaring success.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$root = (Resolve-Path -LiteralPath $Src).Path
$zipPath = Join-Path (Get-Location) $Out
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }

$fs = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::Create)
try {
  $zip = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    $files = Get-ChildItem -LiteralPath $root -Recurse -File | Sort-Object FullName
    foreach ($f in $files) {
      $rel = $f.FullName.Substring($root.Length + 1).Replace('\', '/')
      $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
      $entry.LastWriteTime = $f.LastWriteTime
      $es = $entry.Open()
      $is = [System.IO.File]::OpenRead($f.FullName)
      try { $is.CopyTo($es) } finally { $is.Dispose(); $es.Dispose() }
    }
  } finally { $zip.Dispose() }
} finally { $fs.Dispose() }

# verify
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $names = $zip.Entries | ForEach-Object { $_.FullName }
} finally { $zip.Dispose() }

$badSlash = @($names | Where-Object { $_.Contains('\') })
$badAscii = @($names | Where-Object { $_ -match '[^\x20-\x7E]' })
$hasIndex = $names -contains 'index.html'
$size = (Get-Item -LiteralPath $zipPath).Length

Write-Host ""
Write-Host ("zip ready: {0} entries, {1:N2} MB -> {2}" -f $names.Count, ($size / 1MB), $zipPath) -ForegroundColor Green
Write-Host ("  backslash entries : {0}" -f $badSlash.Count)
Write-Host ("  non-ASCII entries : {0}" -f $badAscii.Count)
Write-Host ("  index.html at root: {0}" -f $hasIndex)
if ($badSlash.Count -gt 0) { Write-Host "  BAD: $($badSlash -join ', ')" -ForegroundColor Red }
if ($badAscii.Count -gt 0) { Write-Host "  BAD: $($badAscii -join ', ')" -ForegroundColor Red }
if (-not $hasIndex) { Write-Host "  BAD: index.html missing from root" -ForegroundColor Red }

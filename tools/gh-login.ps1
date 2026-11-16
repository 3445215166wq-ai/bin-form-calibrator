# GitHub token login helper.
# NOTE: keep this file pure ASCII - Windows PowerShell 5.1 reads .ps1 as ANSI/CP936,
#       and CJK characters here cause a ParserError.
#
# Usage:  powershell -ExecutionPolicy Bypass -File tools\gh-login.ps1
# Or right-click -> Run with PowerShell.
#
# The token is read with Read-Host -AsSecureString, so it is never echoed,
# never written to disk, and never shows up in shell history.

$ErrorActionPreference = "Stop"

# gh may have been installed after this shell started, so extend PATH manually.
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

$gh = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path $gh)) {
    $c = Get-Command gh -ErrorAction SilentlyContinue
    if ($c) { $gh = $c.Source } else { Write-Host "gh.exe not found. Install: winget install GitHub.cli" -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }
}

Write-Host ""
Write-Host "=== GitHub token login ===" -ForegroundColor Cyan
Write-Host "1) open https://github.com/settings/tokens"
Write-Host "2) Generate new token (classic)"
Write-Host "3) check scopes: repo + workflow + read:org"
Write-Host "4) Generate token, then copy it (starts with ghp_)"
Write-Host ""
Write-Host "Paste the token below and press Enter (nothing will be displayed while typing):" -ForegroundColor Yellow

$sec = Read-Host -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "No token read. Exiting." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Logging in (only talks to api.github.com)..." -ForegroundColor Cyan
$token | & $gh auth login --hostname github.com --git-protocol https --with-token 2>&1 | ForEach-Object { "  $_" }

# make git use the same credential
& $gh auth setup-git 2>&1 | Out-Null

Write-Host ""
& $gh auth status 2>&1 | ForEach-Object { "  $_" }

$token = $null
Write-Host ""
Write-Host "Done. You can close this window." -ForegroundColor Green
Read-Host "Press Enter to close"

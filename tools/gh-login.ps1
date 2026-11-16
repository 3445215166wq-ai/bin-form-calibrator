# GitHub Token 登录（token 不显示、不落盘、不进对话）
# 用法：右键"使用 PowerShell 运行"，或在终端里执行
#   powershell -ExecutionPolicy Bypass -File tools\gh-login.ps1

$ErrorActionPreference = "Stop"

# gh 装完可能不在当前 PATH 里，手动补一下
$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

$gh = "C:\Program Files\GitHub CLI\gh.exe"
if (-not (Test-Path $gh)) {
    $c = Get-Command gh -ErrorAction SilentlyContinue
    if ($c) { $gh = $c.Source } else { Write-Host "找不到 gh.exe，请先winget install GitHub.cli" -ForegroundColor Red; Read-Host "按回车退出"; exit 1 }
}

Write-Host ""
Write-Host "=== GitHub Token 登录 ===" -ForegroundColor Cyan
Write-Host "1) 浏览器打开 https://github.com/settings/tokens"
Write-Host "2) Generate new token (classic)"
Write-Host "3) 勾选权限： repo  和  workflow"
Write-Host "4) Generate token 后复制（形如 ghp_xxxxxxxx）"
Write-Host ""
Write-Host "把 token 粘贴到下面并按回车（输入过程中不会显示任何字符，这是正常的）:" -ForegroundColor Yellow

$sec = Read-Host -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($token)) {
    Write-Host "没读到 token，退出。" -ForegroundColor Red
    Read-Host "按回车退出"
    exit 1
}

Write-Host ""
Write-Host "正在登录（只访问 api.github.com）..." -ForegroundColor Cyan
$token | & $gh auth login --hostname github.com --git-protocol https --with-token 2>&1 | ForEach-Object { "  $_" }

# 让 git 也用 gh 的凭据推送
& $gh auth setup-git 2>&1 | Out-Null

Write-Host ""
& $gh auth status 2>&1 | ForEach-Object { "  $_" }

$token = $null
Write-Host ""
Write-Host "完成。可以关掉这个窗口了。" -ForegroundColor Green
Read-Host "按回车关闭"

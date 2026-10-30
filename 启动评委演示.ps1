param(
  [switch]$NoInstall
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'

if (-not (Test-Path (Join-Path $Root '.env'))) {
  Copy-Item (Join-Path $Root '.env.example') (Join-Path $Root '.env')
  Write-Host '已从 .env.example 创建 .env，请按需填写模型 API 配置。' -ForegroundColor Yellow
}

if (-not $NoInstall) {
  if (-not (Test-Path (Join-Path $Backend 'node_modules'))) { npm --prefix $Backend install }
  if (-not (Test-Path (Join-Path $Frontend 'node_modules'))) { npm --prefix $Frontend install }
}

Start-Process powershell -WorkingDirectory $Backend -ArgumentList '-NoExit', '-Command', 'npm run start:dev'
Start-Process powershell -WorkingDirectory $Frontend -ArgumentList '-NoExit', '-Command', 'npm run dev'

Write-Host ''
Write-Host 'UniFlow 评委演示正在启动：' -ForegroundColor Cyan
Write-Host '前端：http://127.0.0.1:5173'
Write-Host '后端健康检查：http://127.0.0.1:8000/health'
Write-Host '演示账号：2026000001'
Write-Host '演示密码：UniFlowDemo2026!'

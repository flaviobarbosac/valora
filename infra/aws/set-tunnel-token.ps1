# Grava o token do Cloudflare Tunnel no segredo valora/prod (sem mostrar na tela)
# e publica de novo para o túnel subir.
# Uso: powershell -ExecutionPolicy Bypass -File infra\aws\set-tunnel-token.ps1
param([string]$Profile = "clampfy-dev", [string]$Region = "sa-east-1")
$ErrorActionPreference = "Continue"
$env:AWS_PROFILE = $Profile
$env:AWS_REGION = $Region

$secure = Read-Host "Cole o token do túnel (Cloudflare > Zero Trust > Networks > Tunnels)" -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $token.Trim()) { Write-Host "Nenhum token informado."; exit 1 }

$current = aws secretsmanager get-secret-value --secret-id valora/prod --query SecretString --output text | ConvertFrom-Json
$current | Add-Member -NotePropertyName TUNNEL_TOKEN -NotePropertyValue $token.Trim() -Force
$file = Join-Path $env:TEMP "valora-secret.json"
[IO.File]::WriteAllText($file, ($current | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
aws secretsmanager put-secret-value --secret-id valora/prod --secret-string "file://$($file -replace '\\','/')" | Out-Null
Remove-Item $file
Remove-Variable token, current
Write-Host "Token gravado. Publicando de novo..."
& (Join-Path $PSScriptRoot "deploy.ps1") -Profile $Profile -Region $Region

# Grava o token do Cloudflare Tunnel no segredo valora/prod (sem mostrar na tela)
# e publica de novo para o túnel subir.
# Uso: powershell -ExecutionPolicy Bypass -File infra\aws\set-tunnel-token.ps1
# Abre a página do túnel no navegador e espera: basta clicar no ícone de copiar
# ao lado do comando de instalação. Nada precisa ser colado.
param(
  [string]$Profile = "clampfy-dev",
  [string]$Region = "sa-east-1",
  [string]$TunnelUrl = "https://dash.cloudflare.com/68ee49a47319bead2713df75da102fa5/tunnels/4aec9ce3-c538-4c4b-a17c-5c416632e7a7",
  [int]$WaitMinutes = 10
)
$ErrorActionPreference = "Continue"
$env:AWS_PROFILE = $Profile
$env:AWS_REGION = $Region

# A tunnel token is base64 JSON with the account (a), tunnel id (t) and secret (s).
# Returns the token found in $Text (a bare token or the whole install command), or $null.
function Find-TunnelToken([string]$Text) {
  foreach ($candidate in [regex]::Matches("$Text", 'eyJ[A-Za-z0-9_\-=]{40,}')) {
    try {
      $padded = $candidate.Value.Replace('-', '+').Replace('_', '/')
      while ($padded.Length % 4) { $padded += '=' }
      $decoded = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($padded)) | ConvertFrom-Json
      if ($decoded.a -and $decoded.t -and $decoded.s) { return $candidate.Value }
    } catch {}
  }
  return $null
}

$token = Find-TunnelToken (Get-Clipboard -Raw -ErrorAction SilentlyContinue)
if (-not $token) {
  Start-Process $TunnelUrl
  Write-Host ""
  Write-Host "Abri a página do túnel 'valora' no navegador." -ForegroundColor Cyan
  Write-Host "Clique no ícone de COPIAR ao lado do comando 'cloudflared service install ...'." -ForegroundColor Cyan
  Write-Host "(Se a página pedir para escolher o sistema, escolha Windows ou Docker.)"
  Write-Host "Esperando o token na área de transferência..."
  $deadline = (Get-Date).AddMinutes($WaitMinutes)
  while (-not $token -and (Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $token = Find-TunnelToken (Get-Clipboard -Raw -ErrorAction SilentlyContinue)
  }
  if (-not $token) { Write-Host "Não recebi o token em $WaitMinutes minutos. Rode de novo quando quiser."; exit 1 }
}
Set-Clipboard -Value " "
Write-Host "Token recebido (e apagado da área de transferência)." -ForegroundColor Green

$current = aws secretsmanager get-secret-value --secret-id valora/prod --query SecretString --output text | ConvertFrom-Json
$current | Add-Member -NotePropertyName TUNNEL_TOKEN -NotePropertyValue $token -Force
$file = Join-Path $env:TEMP "valora-secret.json"
[IO.File]::WriteAllText($file, ($current | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
aws secretsmanager put-secret-value --secret-id valora/prod --secret-string "file://$($file -replace '\\','/')" | Out-Null
Remove-Item $file
Remove-Variable token, current
Write-Host "Token gravado. Publicando de novo..."
& (Join-Path $PSScriptRoot "deploy.ps1") -Profile $Profile -Region $Region

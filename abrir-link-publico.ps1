# Abre um link público (https://...trycloudflare.com) para o VALORA rodando neste computador.
# Antes, deixe o app rodando (iniciar-valora.ps1). Mantenha esta janela aberta enquanto
# quiser o link no ar; feche-a para tirar o app da internet. O endereço muda a cada vez.
# Uso: clique com o botão direito > "Executar com o PowerShell".
$cloudflared = Join-Path $PSScriptRoot "ferramentas\cloudflared.exe"
$envFile = Join-Path $PSScriptRoot "valora\VALORA-codigo-fonte\.env"

try { Invoke-WebRequest http://localhost:3000/api/health -UseBasicParsing -TimeoutSec 5 | Out-Null }
catch { Write-Host "O VALORA não está rodando. Abra primeiro o iniciar-valora.ps1."; Read-Host "Enter para sair"; exit 1 }

Write-Host "Abrindo o link público... (Ctrl+C ou fechar a janela encerra)"
& $cloudflared tunnel --url http://localhost:3000 --no-autoupdate 2>&1 | ForEach-Object {
  $line = "$_"
  if ($line -match 'https://[a-z0-9-]+\.trycloudflare\.com') {
    $url = $Matches[0]
    # Os convites por e-mail passam a usar este endereço (vale depois de reiniciar o app).
    $content = [IO.File]::ReadAllText($envFile)
    if ($content -match '(?m)^APP_URL=') { $content = [regex]::Replace($content, '(?m)^APP_URL=.*$', "APP_URL=$url") } else { $content += "`nAPP_URL=$url`n" }
    [IO.File]::WriteAllText($envFile, $content, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host ""
    Write-Host "LINK PÚBLICO: $url" -ForegroundColor Green
    Write-Host "(Reinicie o iniciar-valora.ps1 para os convites usarem este link.)"
    Write-Host ""
  }
}

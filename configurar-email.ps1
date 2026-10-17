# Configura o envio de e-mails do VALORA (códigos de confirmação e convites).
# A senha é digitada aqui, sem aparecer na tela, e fica só no arquivo .env deste computador.
# Uso: clique com o botão direito > "Executar com o PowerShell", ou no terminal:
#   powershell -ExecutionPolicy Bypass -File C:\Projetos\Valora\configurar-email.ps1
$ErrorActionPreference = "Stop"
$project = Join-Path $PSScriptRoot "valora\VALORA-codigo-fonte"
$envFile = Join-Path $project ".env"
if (-not (Test-Path $envFile)) { Write-Host "Não achei o arquivo $envFile."; Read-Host "Enter para sair"; exit 1 }

Write-Host ""
Write-Host "=== Configurar o envio de e-mails do VALORA ===" -ForegroundColor Cyan
Write-Host "1) Gmail (recomendado para começar)"
Write-Host "2) Outro provedor (Brevo, empresa, etc.)"
$choice = Read-Host "Escolha 1 ou 2"

if ($choice -eq "2") {
  $smtpHost = Read-Host "Servidor SMTP (ex.: smtp-relay.brevo.com)"
  $port = Read-Host "Porta (465 ou 587)"
  $secure = if ($port -eq "465") { "true" } else { "false" }
  $user = Read-Host "Usuário/login do SMTP"
  $fromEmail = Read-Host "E-mail que aparece como remetente"
} else {
  Write-Host ""
  Write-Host "Antes, gere uma SENHA DE APP do Google (a senha normal não funciona):"
  Write-Host "  1. Ative a verificação em duas etapas: https://myaccount.google.com/security"
  Write-Host "  2. Crie a senha de app em:            https://myaccount.google.com/apppasswords"
  Write-Host ""
  $smtpHost = "smtp.gmail.com"; $port = "465"; $secure = "true"
  $user = (Read-Host "Seu e-mail do Gmail").Trim()
  $fromEmail = $user
}

$secret = Read-Host "Senha de app (não aparece enquanto digita)" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret))
$plain = $plain -replace '\s', ''   # o Google mostra a senha em blocos com espaços
if (-not $user -or -not $plain) { Write-Host "E-mail e senha são obrigatórios."; Read-Host "Enter para sair"; exit 1 }

$values = [ordered]@{
  SMTP_HOST = $smtpHost; SMTP_PORT = $port; SMTP_SECURE = $secure
  SMTP_USER = $user; SMTP_PASS = $plain; SMTP_FROM = "VALORA <$fromEmail>"
}
$content = [IO.File]::ReadAllText($envFile)
foreach ($key in $values.Keys) {
  $line = "$key=$($values[$key])"
  # A function (not a replacement string) so "$" or "\" in the password are written as typed.
  $evaluator = [Text.RegularExpressions.MatchEvaluator]({ param($m) $line }.GetNewClosure())
  if ($content -match "(?m)^$key=.*$") { $content = [regex]::Replace($content, "(?m)^$key=[^\r\n]*", $evaluator) }
  else { $content = $content.TrimEnd() + "`r`n$line`r`n" }
}
[IO.File]::WriteAllText($envFile, $content, (New-Object System.Text.UTF8Encoding($false)))
$plain = $null
Write-Host ""
Write-Host "Configuração salva no .env." -ForegroundColor Green

$to = Read-Host "Para qual e-mail mando um teste? (Enter = $user)"
if (-not $to) { $to = $user }
Set-Location $project
& "C:\Program Files\nodejs\node.exe" node_modules/tsx/dist/cli.mjs server/scripts/testarEmail.ts --para $to
if ($LASTEXITCODE -eq 0) {
  Write-Host ""
  Write-Host "Pronto! Reinicie o VALORA (feche e abra o iniciar-valora.ps1, ou peça ao Claude) para ele usar o e-mail." -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "O teste falhou. Leia a 'Provável causa' acima e rode este assistente de novo." -ForegroundColor Yellow
}
Read-Host "Enter para fechar"

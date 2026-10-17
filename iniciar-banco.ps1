# Inicia o banco MariaDB do VALORA (dados em C:\Projetos\Valora\banco-dados).
# Uso: clique com o botão direito > "Executar com o PowerShell", ou rode no terminal:
#   powershell -ExecutionPolicy Bypass -File C:\Projetos\Valora\iniciar-banco.ps1
$bin = "C:\Program Files\MariaDB 13.0\bin"
$ini = Join-Path $PSScriptRoot "banco-dados\my.ini"

if (Get-Process mariadbd -ErrorAction SilentlyContinue) {
  Write-Host "O banco já está rodando."
  exit 0
}

Start-Process -FilePath "$bin\mariadbd.exe" -ArgumentList "--defaults-file=`"$ini`"" -WindowStyle Hidden
Start-Sleep -Seconds 3
if (Get-Process mariadbd -ErrorAction SilentlyContinue) {
  Write-Host "Banco iniciado em 127.0.0.1:3306."
} else {
  Write-Host "O banco não iniciou. Veja o arquivo .err em $PSScriptRoot\banco-dados."
  exit 1
}

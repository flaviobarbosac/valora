# Inicia o banco de dados e o VALORA. Depois abra http://localhost:3000.
# Uso: clique com o botão direito > "Executar com o PowerShell", ou no terminal:
#   powershell -ExecutionPolicy Bypass -File C:\Projetos\Valora\iniciar-valora.ps1
& (Join-Path $PSScriptRoot "iniciar-banco.ps1")
if ($LASTEXITCODE -ne 0) { exit 1 }

Set-Location (Join-Path $PSScriptRoot "valora\VALORA-codigo-fonte")
Write-Host "Iniciando o VALORA em http://localhost:3000 (feche esta janela para parar)..."
& "C:\Program Files\nodejs\node.exe" node_modules/tsx/dist/cli.mjs server/_core/dev.ts

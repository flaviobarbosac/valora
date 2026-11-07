# Inicia o banco PostgreSQL 18 do VALORA (contêiner "valora-postgres18" no Docker Desktop).
# Uso: clique com o botão direito > "Executar com o PowerShell", ou rode no terminal:
#   powershell -ExecutionPolicy Bypass -File C:\Projetos\Valora\iniciar-banco.ps1
# Senha e endereço de conexão: C:\Projetos\Valora\postgres-local.txt
$docker = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\resources\bin\docker.exe"
if (-not (Test-Path $docker)) { $docker = "docker" }
$container = "valora-postgres18"

function Test-Engine { & $docker info *> $null; return $LASTEXITCODE -eq 0 }

if (-not (Test-Engine)) {
  Write-Host "Abrindo o Docker Desktop..."
  $desktop = Join-Path $env:LOCALAPPDATA "Programs\DockerDesktop\Docker Desktop.exe"
  if (Test-Path $desktop) { Start-Process $desktop } else { Write-Host "Docker Desktop não encontrado."; exit 1 }
  for ($i = 0; $i -lt 90 -and -not (Test-Engine); $i++) { Start-Sleep -Seconds 2 }
  if (-not (Test-Engine)) { Write-Host "O Docker não ligou. Abra o Docker Desktop e tente de novo."; exit 1 }
}

& $docker start $container *> $null
if ($LASTEXITCODE -ne 0) { Write-Host "O contêiner $container não existe. Veja postgres-local.txt para recriá-lo."; exit 1 }
for ($i = 0; $i -lt 30; $i++) {
  & $docker exec $container pg_isready -U valora -d valora *> $null
  if ($LASTEXITCODE -eq 0) { Write-Host "Banco PostgreSQL 18 pronto em 127.0.0.1:5432."; exit 0 }
  Start-Sleep -Seconds 1
}
Write-Host "O PostgreSQL não respondeu. Veja os registros com: docker logs $container"
exit 1
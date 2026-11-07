# Builds the VALORA image, pushes it to the "valora" ECR repository and deploys it
# to /opt/valora on the shared EC2 through SSM. Nothing owned by Clampfy is touched:
# the compose file and the remote script travel inside the SSM command itself.
# Uso: powershell -ExecutionPolicy Bypass -File infra\aws\deploy.ps1
param(
  [string]$Profile = "clampfy-dev",
  [string]$Region = "sa-east-1",
  [string]$InstanceId = "i-09b83e8513a37faa4"
)
$ErrorActionPreference = "Continue"
# GitHub Actions already has OIDC credentials. A named profile does not exist on the runner.
if ($env:GITHUB_ACTIONS -eq "true") {
  Remove-Item Env:AWS_PROFILE -ErrorAction SilentlyContinue
} else {
  $env:AWS_PROFILE = $Profile
}
$env:AWS_REGION = $Region
# The AWS CLI prints the remote output; without UTF-8 it fails on non-ASCII characters.
$env:PYTHONIOENCODING = "utf-8"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$app = Join-Path $root "valora\VALORA-codigo-fonte"

$account = aws sts get-caller-identity --query Account --output text
$registry = "$account.dkr.ecr.$Region.amazonaws.com"
$tag = (git -C $root rev-parse --short HEAD) + "-" + (Get-Date -Format "yyyyMMddHHmm")
$image = "$registry/valora:$tag"

Write-Host "Build $image ..." -ForegroundColor Cyan
docker build --platform linux/amd64 -t $image $app
if ($LASTEXITCODE -ne 0) { throw "docker build falhou" }
# Windows PowerShell 5.1 re-encodes a pipe and ECR rejects the token. PowerShell 7 (the runner) does not.
if ($PSVersionTable.PSVersion.Major -lt 6) {
  cmd /c "aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $registry" | Out-Null
} else {
  aws ecr get-login-password --region $Region | docker login --username AWS --password-stdin $registry
}
if ($LASTEXITCODE -ne 0) { throw "docker login falhou" }
docker push $image
if ($LASTEXITCODE -ne 0) { throw "docker push falhou" }

function To-B64([string]$Path) {
  [Convert]::ToBase64String([IO.File]::ReadAllBytes($Path))
}
$compose = To-B64 (Join-Path $PSScriptRoot "docker-compose.yml")
$remote = To-B64 (Join-Path $PSScriptRoot "remote-deploy.sh")
$commands = @(
  "mkdir -p /opt/valora",
  "echo $compose | base64 -d | tr -d '\r' > /opt/valora/docker-compose.yml",
  "echo $remote | base64 -d | tr -d '\r' > /opt/valora/remote-deploy.sh",
  "chmod 700 /opt/valora/remote-deploy.sh",
  "AWS_REGION=$Region /opt/valora/remote-deploy.sh $image"
)
$params = Join-Path ([IO.Path]::GetTempPath()) "valora-deploy-ssm.json"
[IO.File]::WriteAllText($params, (@{ commands = $commands } | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
$cid = aws ssm send-command --instance-ids $InstanceId --document-name AWS-RunShellScript --timeout-seconds 900 `
  --comment "valora deploy $tag" --parameters "file://$($params -replace '\\','/')" --query Command.CommandId --output text
Remove-Item $params
Write-Host "Deploy na EC2 (SSM $cid) ..." -ForegroundColor Cyan
do {
  Start-Sleep -Seconds 5
  $status = aws ssm get-command-invocation --command-id $cid --instance-id $InstanceId --query Status --output text 2>$null
} while ($status -in @("Pending", "InProgress", "Delayed", ""))
aws ssm get-command-invocation --command-id $cid --instance-id $InstanceId --query StandardOutputContent --output text
$err = aws ssm get-command-invocation --command-id $cid --instance-id $InstanceId --query StandardErrorContent --output text
if ($err) { Write-Host $err -ForegroundColor Yellow }
Write-Host "Status: $status" -ForegroundColor $(if ($status -eq "Success") { "Green" } else { "Red" })
if ($status -ne "Success") { exit 1 }

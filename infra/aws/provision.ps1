# One-time setup of the VALORA resources in the Clampfy AWS account.
# Creates only new resources named "valora"; nothing owned by Clampfy is changed.
#   - ECR repository "valora" (keeps the last 10 images)
#   - Secrets Manager secret "valora/prod", readable by the shared EC2 role through
#     the secret's own resource policy (the Clampfy role policy is not edited)
# Safe to run again: existing resources are kept and only the policies are re-applied.
param(
  [string]$Profile = "clampfy-dev",
  [string]$Region = "sa-east-1",
  [string]$Ec2RoleArn = "arn:aws:iam::635198174869:role/clampfy-dev-ec2-role",
  [string]$InstanceId = "i-09b83e8513a37faa4",
  # Immutable subject (owner id + repo id). The name-only claim is rejected.
  [string]$GitHubSubject = "repo:flaviobarbosac@112890739/valora@1423636550:ref:refs/heads/main"
)
# "Continue": the existence checks below rely on the AWS CLI exit code, and Windows
# PowerShell 5.1 would turn their expected "not found" stderr into a fatal error.
$ErrorActionPreference = "Continue"
$env:AWS_PROFILE = $Profile
$env:AWS_REGION = $Region
$tags = "Key=Project,Value=valora"

function Write-Utf8([string]$Path, [string]$Text) {
  [IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding($false)))
}

aws ecr describe-repositories --repository-names valora *> $null
if ($LASTEXITCODE -ne 0) {
  aws ecr create-repository --repository-name valora --image-scanning-configuration scanOnPush=true --tags $tags | Out-Null
  Write-Host "ECR valora criado."
}
$lifecycle = Join-Path $env:TEMP "valora-ecr-lifecycle.json"
Write-Utf8 $lifecycle '{"rules":[{"rulePriority":1,"description":"keep last 10","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}'
aws ecr put-lifecycle-policy --repository-name valora --lifecycle-policy-text "file://$($lifecycle -replace '\\','/')" | Out-Null

aws secretsmanager describe-secret --secret-id valora/prod *> $null
if ($LASTEXITCODE -ne 0) {
  $initial = Join-Path $env:TEMP "valora-secret.json"
  Write-Utf8 $initial "{}"
  aws secretsmanager create-secret --name valora/prod --description "VALORA prod: banco, sessão, SMTP e túnel" --secret-string "file://$($initial -replace '\\','/')" --tags $tags | Out-Null
  Remove-Item $initial
  Write-Host "Segredo valora/prod criado (vazio)."
}
$policy = Join-Path $env:TEMP "valora-secret-policy.json"
Write-Utf8 $policy (@{
  Version = "2012-10-17"
  Statement = @(@{
    Sid = "SharedEc2ReadsValora"
    Effect = "Allow"
    Principal = @{ AWS = $Ec2RoleArn }
    Action = @("secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret")
    Resource = "*"
  })
} | ConvertTo-Json -Depth 6)
aws secretsmanager put-resource-policy --secret-id valora/prod --resource-policy "file://$($policy -replace '\\','/')" --block-public-policy | Out-Null
Remove-Item $policy, $lifecycle

# Deploy from GitHub Actions on push to main. Trusts only that ref.
# Reuses the OIDC provider Clampfy already created; the Clampfy role is not edited.
$account = aws sts get-caller-identity --query Account --output text
$oidcArn = "arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com"
$roleName = "valora-github-actions"
$trust = Join-Path $env:TEMP "valora-github-trust.json"
Write-Utf8 $trust (@{
  Version = "2012-10-17"
  Statement = @(@{
    Effect = "Allow"
    Principal = @{ Federated = $oidcArn }
    Action = "sts:AssumeRoleWithWebIdentity"
    Condition = @{
      StringEquals = @{
        "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        "token.actions.githubusercontent.com:sub" = $GitHubSubject
      }
    }
  })
} | ConvertTo-Json -Depth 8)
$trustPath = "file://$($trust -replace '\\','/')"
aws iam get-role --role-name $roleName *> $null
if ($LASTEXITCODE -ne 0) {
  aws iam create-role --role-name $roleName --assume-role-policy-document $trustPath `
    --description "VALORA deploy from GitHub Actions on main" --tags $tags | Out-Null
  Write-Host "Role $roleName criada."
} else {
  aws iam update-assume-role-policy --role-name $roleName --policy-document $trustPath | Out-Null
}
$deployPolicy = Join-Path $env:TEMP "valora-github-deploy.json"
Write-Utf8 $deployPolicy (@{
  Version = "2012-10-17"
  Statement = @(
    @{
      Effect = "Allow"
      Action = "ecr:GetAuthorizationToken"
      Resource = "*"
    },
    @{
      Effect = "Allow"
      Action = @(
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      )
      Resource = "arn:aws:ecr:${Region}:${account}:repository/valora"
    },
    @{
      Effect = "Allow"
      Action = "ssm:SendCommand"
      Resource = @(
        "arn:aws:ec2:${Region}:${account}:instance/${InstanceId}",
        "arn:aws:ssm:${Region}::document/AWS-RunShellScript",
        "arn:aws:ssm:${Region}:${account}:document/AWS-RunShellScript"
      )
    },
    @{
      Effect = "Allow"
      Action = @("ssm:GetCommandInvocation", "ssm:ListCommandInvocations")
      Resource = "*"
    }
  )
} | ConvertTo-Json -Depth 8)
aws iam put-role-policy --role-name $roleName --policy-name valora-deploy `
  --policy-document "file://$($deployPolicy -replace '\\','/')" | Out-Null
$roleArn = aws iam get-role --role-name $roleName --query Role.Arn --output text
Remove-Item $trust, $deployPolicy
Write-Host "Pronto: ECR valora, segredo valora/prod e role $roleArn."
Write-Host "Segredo do repositório: AWS_GITHUB_ACTIONS_ROLE_ARN=$roleArn"

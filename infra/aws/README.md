# VALORA na AWS (EC2 e RDS compartilhados com o Clampfy)

O VALORA roda na mesma EC2 e no mesmo RDS do Clampfy, **sem alterar nada do Clampfy**:

| Peça | Como fica |
| --- | --- |
| EC2 `i-09b83e8513a37faa4` (t3.medium) | Pasta `/opt/valora`, projeto Docker `valora` e rede `valora`. Nenhuma porta aberta. Limites: app 384 MB / 0,75 CPU, túnel 96 MB / 0,25 CPU. Se a memória acabar, o kernel para o VALORA antes do Clampfy (`oom_score_adj: 1000`). |
| RDS `clampfy-dev-postgres`, banco `clampfy_dev` | Schema `valora` e usuário `valora`, que só enxerga o próprio schema. No máximo 5 conexões (o app usa 3), `statement_timeout` de 30 s. |
| Entrada `valorapipe.com.br` | Cloudflare Tunnel (`cloudflared`): conexão de saída, sem mexer no Caddy, nas portas nem no security group do Clampfy. HTTPS feito pelo Cloudflare. |
| Imagens | ECR `valora` (guarda as 10 últimas). |
| Segredos | Secrets Manager `valora/prod`. A EC2 lê pela política do próprio segredo; a role do Clampfy não foi editada. |

## Arquivos

- `provision.ps1`: cria o ECR `valora` e o segredo `valora/prod` (uma vez; pode rodar de novo).
- `db-setup.sh`: cria o usuário e o schema `valora` no RDS (roda na EC2 via SSM; pode rodar de novo).
- `deploy.ps1`: build da imagem, push para o ECR e deploy na EC2 via SSM.
- `remote-deploy.sh`: roda na EC2: gera o `.env` a partir do segredo, aplica migrações (`server/scripts/migrar.ts`) e sobe os containers.
- `docker-compose.yml`: containers `valora-app` e `valora-tunnel`.
- `set-tunnel-token.ps1`: grava o token do Cloudflare Tunnel no segredo e publica.

## Publicar uma nova versão

```powershell
powershell -ExecutionPolicy Bypass -File infra\aws\deploy.ps1
```

## Ligar o domínio (uma vez)

1. Crie uma conta grátis no Cloudflare e adicione o site `valorapipe.com.br` (plano Free).
2. No Registro.br, troque os servidores DNS do domínio pelos 2 que o Cloudflare mostrar.
3. No Cloudflare: **Zero Trust › Networks › Tunnels › Create a tunnel** (tipo Cloudflared), nome `valora`. Copie o token.
4. Na aba **Public Hostname** do túnel: hostname `valorapipe.com.br`, serviço `HTTP` e URL `valora-app:3000`. Repita para `www` se quiser.
5. Rode `infra\aws\set-tunnel-token.ps1` e cole o token.

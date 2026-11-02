#!/usr/bin/env bash
# Runs on the shared EC2 through SSM. Creates, inside the Clampfy database, the
# "valora" login role and the "valora" schema. The role can only use its own schema:
# no access to the Clampfy schemas, a 5-connection cap and a statement timeout.
# Idempotent: safe to run again (re-applies the password and the limits).
set -euo pipefail
AWS_REGION="${AWS_REGION:-sa-east-1}"

CS=$(aws secretsmanager get-secret-value --secret-id clampfy/dev/app-core --query SecretString --output text --region "$AWS_REGION" | jq -r .connectionString)
get() { echo "$CS" | tr ';' '\n' | grep -i "^$1=" | head -1 | cut -d= -f2-; }
export PGHOST=$(get Host) PGPORT=$(get Port) PGDATABASE=$(get Database) PGUSER=$(get Username) PGPASSWORD=$(get Password)
export VALORA_PASSWORD=$(aws secretsmanager get-secret-value --secret-id valora/prod --query SecretString --output text --region "$AWS_REGION" | jq -r .VALORA_DB_PASSWORD)

docker run --rm -i -e PGHOST -e PGPORT -e PGDATABASE -e PGUSER -e PGPASSWORD -e VALORA_PASSWORD postgres:16-alpine \
  sh -c 'psql -X -v ON_ERROR_STOP=1 -v valora_password="$VALORA_PASSWORD" -v dbname="$PGDATABASE"' <<'SQL'
SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'valora') AS create_role \gset
\if :create_role
  CREATE ROLE valora LOGIN PASSWORD :'valora_password';
\else
  ALTER ROLE valora PASSWORD :'valora_password';
\endif
ALTER ROLE valora NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 5;
ALTER ROLE valora SET search_path = valora;
ALTER ROLE valora SET statement_timeout = '30s';
ALTER ROLE valora SET idle_in_transaction_session_timeout = '60s';
CREATE SCHEMA IF NOT EXISTS valora;
GRANT CONNECT ON DATABASE :"dbname" TO valora;
GRANT USAGE, CREATE ON SCHEMA valora TO valora;
SELECT 'role ok: ' || rolname || ' connlimit=' || rolconnlimit FROM pg_roles WHERE rolname = 'valora';
SQL

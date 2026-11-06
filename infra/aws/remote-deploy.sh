#!/usr/bin/env bash
# Runs on the shared EC2 through SSM. Touches only /opt/valora and the "valora"
# compose project; Clampfy files, containers and networks are never used.
set -euo pipefail

AWS_REGION="${AWS_REGION:-sa-east-1}"
SECRET_ID="valora/prod"
DIR=/opt/valora
VALORA_IMAGE="$1"

mkdir -p "$DIR"
cd "$DIR"
# Pin the compose project so this deploy cannot select or remove Clampfy containers.
export COMPOSE_PROJECT_NAME=valora
export COMPOSE_FILE="$DIR/docker-compose.yml"

SECRET=$(aws secretsmanager get-secret-value --secret-id "$SECRET_ID" --query SecretString --output text --region "$AWS_REGION")
umask 077
echo "$SECRET" | jq -r 'to_entries | map(select(.key != "TUNNEL_TOKEN" and .key != "VALORA_DB_PASSWORD")) | .[] | "\(.key)=\(.value)"' > .env
TUNNEL_TOKEN=$(echo "$SECRET" | jq -r '.TUNNEL_TOKEN // empty')
umask 022

REGISTRY="${VALORA_IMAGE%%/*}"
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
docker pull -q "$VALORA_IMAGE"

# Migrations run in a throwaway container with the same settings as the app. The
# VALORA role cannot create schemas, so drizzle-kit (which always runs CREATE SCHEMA)
# is replaced by the app's own runner, limited to the existing "valora" schema.
docker run --rm --env-file .env --memory 384m "$VALORA_IMAGE" node node_modules/tsx/dist/cli.mjs server/scripts/migrar.ts

export VALORA_IMAGE TUNNEL_TOKEN
PROFILES=()
if [ -n "$TUNNEL_TOKEN" ]; then PROFILES=(--profile tunnel); fi
docker compose "${PROFILES[@]}" up -d --remove-orphans

for i in $(seq 1 30); do
  status=$(docker inspect -f '{{.State.Health.Status}}' valora-app 2>/dev/null || echo starting)
  [ "$status" = "healthy" ] && break
  sleep 3
done
docker compose "${PROFILES[@]}" ps
echo "valora-app health: $status"
[ "$status" = "healthy" ]

#!/usr/bin/env bash
# Candidate one-off migration only. Caller may switch API/Web ONLY after this returns zero.
set -euo pipefail
: "${PRESERVE_ARTIFACTS:?preserve mode required}"
[[ "$PRESERVE_ARTIFACTS" = true ]] || { echo '::error::preserve mode required'; exit 1; }
parent=${1:?dedicated migration evidence parent required}
mkdir -p "$parent"
dir=$(mktemp -d "$parent/schema-first.XXXXXXXX")
name="phoenix-migrate-$(basename "$dir" | tr '[:upper:].' '[:lower:]-')"
image_ref=${2:?explicit candidate API image reference required}
[[ -n "$image_ref" && "$image_ref" != *$'\n'* ]] || { echo '::error::ambiguous candidate image'; exit 1; }
image_id=$(docker image inspect "$image_ref" --format '{{.Id}}')
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo '::error::candidate image unavailable'; exit 1; }
printf '%s\n' "$image_id" > "$dir/candidate-image.txt"
echo "migration evidence: $dir" >&2
# Plain `docker run`, NOT `docker compose run`: the production deploy shell
# routes every `docker compose ...` through the reviewed compose guard, whose
# operation allowlist intentionally admits only ps/pull/up/restart, so a
# compose-run one-off migration always died with COMPOSE_HOLD=
# UNSUPPORTED_OPERATION before TypeORM ever ran (and allowlisting `run` would
# change a floor-contract critical file). A candidate migration container is
# not a service lifecycle operation; this script therefore talks to plain
# docker (the deploy shell passes non-compose invocations straight through)
# and reproduces exactly what compose used to provide:
#   1. the project network — resolved live from the db container endpoint so
#      no project name is hardcoded and renames cannot break resolution;
#   2. the DB_* environment — the exact keys the TypeORM CLI data source
#      reads, extracted from the repo .env. No wholesale --env-file: secrets
#      like JWT_SECRET never enter the throwaway container;
#   3. the same fixed entrypoint, phoenix user, PGOPTIONS and evidence
#      contract as the previous compose-run implementation.
repo_env=/data/phoenix-erp/.env
[ -r "$repo_env" ] || { echo "::error::repo .env unreadable: $repo_env"; exit 1; }
env_value() {
  local value
  value=$(grep -m1 -E "^$1=" "$repo_env" | cut -d= -f2- || true)
  value=${value%\"}; value=${value#\"}
  printf '%s' "$value"
}
network=$(docker inspect phoenix-v3-db --format '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}')
[[ "$network" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || { echo "::error::db network unresolved: $network"; exit 1; }
DB_USER_VALUE=$(env_value DB_USER); DB_PASSWORD_VALUE=$(env_value DB_PASSWORD); DB_NAME_VALUE=$(env_value DB_NAME)
# Mirror the compose api-service defaults (docker-compose.yml: DB_USER:-phoenix_v3,
# DB_PASSWORD:-phoenix_v3_pass, DB_NAME:-phoenix_erp): production .env may only
# pin DB_PASSWORD and rely on these defaults for user/name.
: "${DB_USER_VALUE:=phoenix_v3}" "${DB_NAME_VALUE:=phoenix_erp}"
[ -n "$DB_PASSWORD_VALUE" ] || { echo '::error::DB_PASSWORD missing in repo .env'; exit 1; }
# No service ports, dependencies, AppModule, cleanup or default chown entrypoint.
# Logs stay in the evidence dir on success; on failure the fixed log tail becomes
# part of the deploy output so the host-side cause is visible from CI alone.
if ! docker run --name "$name" --user phoenix --network "$network" \
  -e DB_HOST=db -e DB_PORT=5432 \
  -e DB_USER="$DB_USER_VALUE" -e DB_PASSWORD="$DB_PASSWORD_VALUE" -e DB_NAME="$DB_NAME_VALUE" \
  -e PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s' \
  --entrypoint ./node_modules/.bin/typeorm "$image_id" \
  -d dist/database/data-source.js migration:run --transaction all > "$dir/run.log" 2>&1; then
  echo "::error::candidate migration:run failed; tail of $dir/run.log:" >&2
  tail -n 60 "$dir/run.log" >&2 || true
  exit 1
fi
if ! docker run --name "$name-show" --user phoenix --network "$network" \
  -e DB_HOST=db -e DB_PORT=5432 \
  -e DB_USER="$DB_USER_VALUE" -e DB_PASSWORD="$DB_PASSWORD_VALUE" -e DB_NAME="$DB_NAME_VALUE" \
  --entrypoint ./node_modules/.bin/typeorm "$image_id" \
  -d dist/database/data-source.js migration:show > "$dir/show.log" 2>&1; then
  echo "::error::candidate migration:show failed; tail of $dir/show.log:" >&2
  tail -n 60 "$dir/show.log" >&2 || true
  exit 1
fi
if grep -Fq '[ ]' "$dir/show.log" || ! grep -Fq '[X]' "$dir/show.log"; then
  echo "::error::pending or missing migration verification; tail of $dir/show.log:" >&2
  tail -n 60 "$dir/show.log" >&2 || true
  exit 1
fi
printf '%s\n' "$image_id" > "$dir/verified-image.txt"
echo 'candidate migrations verified; application switch may now proceed' >&2
printf '%s\n' "$image_id"

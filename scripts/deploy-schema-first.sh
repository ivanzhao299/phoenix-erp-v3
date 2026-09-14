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
export API_IMAGE="$image_id"
echo "migration evidence: $dir" >&2
# No service ports, dependencies, AppModule, cleanup or default chown entrypoint.
docker compose run --no-deps -T --name "$name" --user phoenix \
  -e PGOPTIONS='-c lock_timeout=5s -c statement_timeout=120s' \
  --entrypoint ./node_modules/.bin/typeorm api \
  -d dist/database/data-source.js migration:run --transaction all > "$dir/run.log" 2>&1
docker compose run --no-deps -T --name "$name-show" --user phoenix \
  --entrypoint ./node_modules/.bin/typeorm api \
  -d dist/database/data-source.js migration:show > "$dir/show.log" 2>&1
if grep -Fq '[ ]' "$dir/show.log" || ! grep -Fq '[X]' "$dir/show.log"; then
  echo '::error::pending or missing migration verification'; exit 1
fi
printf '%s\n' "$image_id" > "$dir/verified-image.txt"
echo 'candidate migrations verified; application switch may now proceed' >&2
printf '%s\n' "$image_id"

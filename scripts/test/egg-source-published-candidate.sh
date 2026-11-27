#!/usr/bin/env bash
set -euo pipefail
: "${API_CANDIDATE:?}" "${WEB_CANDIDATE:?}"
result=${1:?result folder required}
mkdir -p "$result"
dist=$(mktemp -d "$PWD/apps/api/.egg-source-candidate.XXXXXXXX")
api_container=
network_args=(--network host --add-host api:127.0.0.1)
cleanup() {
  if [[ -n "$api_container" ]]; then docker rm "$api_container" >/dev/null 2>&1 || true; fi
  docker rm -f egg-source-candidate-web egg-source-candidate-postgres >/dev/null 2>&1 || true
  find "$dist" -depth -delete
}
trap cleanup EXIT
api_container=$(docker create "$API_CANDIDATE")
docker cp "$api_container:/app/dist/." "$dist"
test -s "$dist/modules/product-master/controllers/egg-source-change.controller.js"
docker run -d --name egg-source-candidate-postgres -p 127.0.0.1:5548:5432 -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_DB=published_egg_source_fixture postgres:18-alpine >/dev/null
docker run -d --name egg-source-candidate-web "${network_args[@]}" -e PORT=5088 "$WEB_CANDIDATE" >/dev/null
for attempt in $(seq 1 30); do
  if docker exec egg-source-candidate-postgres pg_isready -q && curl -fsS http://127.0.0.1:5088/login -o /dev/null; then break; fi
  sleep 1
done
docker exec egg-source-candidate-postgres pg_isready -q
curl -fsS http://127.0.0.1:5088/login -o /dev/null
export OFFICIAL_INVENTORY_PG_URL=postgresql://postgres@127.0.0.1:5548/published_egg_source_fixture
export EGG_SOURCE_CANDIDATE_DIST="$dist" EGG_SOURCE_HTTP_PORT=3100 EGG_SOURCE_BROWSER_URL=http://127.0.0.1:5088
pnpm --filter phoenix-erp-v3-nest exec jest --runInBand --testTimeout=90000 --json --outputFile "$result/jest.json" \
  --resolver "$PWD/scripts/test/egg-source-image-jest-resolver.cjs" --runTestsByPath \
  src/modules/product-master/services/egg-source-change.pg.spec.ts 2>&1 | tee "$result/test.log"
node -e '
  const r=require(process.argv[1]);
  if (!r.success||r.numPassedTests!==14||r.numPendingTests!==0||r.numFailedTests!==0) process.exitCode=1;
' "$result/jest.json"
grep -Fx 'EGG_SOURCE_CANDIDATE_BROWSER=PASS' "$result/test.log"

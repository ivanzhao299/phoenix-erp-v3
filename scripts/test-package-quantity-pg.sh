#!/usr/bin/env bash
set -euo pipefail
container_name="phoenix-package-quantity-$(date +%s)-$$"
cleanup() { docker stop "$container_name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cid=$(docker run -d --rm --name "$container_name" --tmpfs /var/lib/postgresql -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=quantity_fixture -p 127.0.0.1::5432 postgres:18-alpine)
for attempt in $(seq 1 50); do
  if docker exec "$container_name" pg_isready -U postgres -d quantity_fixture >/dev/null 2>&1; then break; fi
  sleep 0.3
done
port=$(docker port "$container_name" 5432/tcp | sed 's/127.0.0.1://')
owner="quantity-fixture-$$"
docker exec "$container_name" psql -U postgres -d quantity_fixture -v ON_ERROR_STOP=1 -c "CREATE TABLE quantity_fixture_owner(owner_key text); INSERT INTO quantity_fixture_owner VALUES ('$owner');" >/dev/null
PACKAGE_QUANTITY_PG_URL="postgresql://postgres@127.0.0.1:$port/quantity_fixture" PACKAGE_QUANTITY_FIXTURE_OWNER="$owner" node apps/api/node_modules/jest/bin/jest.js --config apps/api/jest.config.js --runInBand --runTestsByPath apps/api/src/modules/product-master/services/package-quantity.pg.spec.ts --json --outputFile tmp/phase5-pg.json > tmp/phase5-pg.log 2>&1

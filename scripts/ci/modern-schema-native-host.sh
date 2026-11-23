#!/usr/bin/env bash
set -euo pipefail

test "$RUNNER_ENVIRONMENT" = github-hosted
test "$(git rev-parse HEAD)" = "$GITHUB_SHA"
[[ "$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT" =~ ^[0-9]+-[0-9]+$ ]]
fixture="phoenix-modern-native-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"
image="$fixture:owned"
root=/phoenix-fixture-root
out="$GITHUB_WORKSPACE/artifacts/modern-schema-native-host"
pg_major=${MODERN_HOST_FIXTURE_PG_MAJOR:-18}
[[ "$pg_major" = 16 || "$pg_major" = 18 ]]
test ! -e "$out/result.json"
mkdir -p "$out"

# Keep the runner's built-in schedulers outside the fixture namespace. The
# production readers still inspect every real process and scheduler visible
# inside the isolated host, with their normal root and FD9 validation.
docker build --tag "$image" - <<'DOCKERFILE'
FROM node:20-alpine AS node-runtime
FROM docker:29.5.1-dind
COPY --from=node-runtime /usr/local/bin/node /usr/bin/node
RUN apk add --no-cache bash e2fsprogs iproute2 nftables libstdc++ python3 util-linux \
    && ln -sf /usr/local/bin/docker /usr/bin/docker
DOCKERFILE

docker run -d --privileged --name "$fixture" --label phoenix.fixture=modern-native-kernel "$image" \
  --data-root=/var/lib/docker --storage-driver=vfs >/dev/null
trap 'if docker exec "$fixture" test -f /phoenix-fixture-root/tmp/phoenix-modern-native-host-result.json; then
        docker exec "$fixture" cat /phoenix-fixture-root/tmp/phoenix-modern-native-host-result.json > "$out/result.json"
        cat "$out/result.json"
      fi' EXIT
for ((attempt=0; attempt<40; attempt++)); do
  if docker exec "$fixture" docker info >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$fixture" docker info --format '{{.Driver}}'
docker save "postgres:$pg_major-alpine" node:20-alpine nginx:1.28-alpine | docker exec -i "$fixture" docker load >/dev/null

docker exec "$fixture" sh -ecs '
  root=$1
  test ! -e "$root"
  mkdir "$root"
  truncate -s 256M /tmp/phoenix-native-ext4
  mkfs.ext4 -q -F /tmp/phoenix-native-ext4
  mount -o loop /tmp/phoenix-native-ext4 "$root"
  cd "$root"
  for dir in bin sbin usr lib proc dev sys etc run; do
    mkdir "$dir"
    mount --bind "/$dir" "$dir"
  done
  mkdir -p var/lib data/phoenix-erp tmp
  ln -s /run var/run
  test -x /usr/sbin/ip || ln -s /sbin/ip /usr/sbin/ip
  install -d -m 0700 var/lib/phoenix-erp var/lib/phoenix-erp/production-deployment-state var/lib/phoenix-erp/production-checkout-recovery
  install -d -m 0555 var/lib/phoenix-background-control
  install -m 0600 /dev/null var/lib/phoenix-erp/production-deployment-state/mutation.lock
' -- "$root"
tar -C "$GITHUB_WORKSPACE" -cf - scripts/ops scripts/ci | docker exec -i "$fixture" tar -xf - -C "$root/data/phoenix-erp"

docker exec "$fixture" chroot "$root" /usr/bin/env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  MODERN_HOST_FIXTURE_ONLY=DISPOSABLE_GITHUB_VM MODERN_HOST_FIXTURE_RESULT=/tmp/phoenix-modern-native-host-result.json \
  MODERN_HOST_FIXTURE_PG_MAJOR="$pg_major" /bin/bash -c '
    set -euo pipefail
    cd /data/phoenix-erp
    exec 9<>/var/lib/phoenix-erp/production-deployment-state/mutation.lock
    flock -n 9
    /usr/bin/node scripts/ci/modern-schema-native-host.fixture.mjs
  '

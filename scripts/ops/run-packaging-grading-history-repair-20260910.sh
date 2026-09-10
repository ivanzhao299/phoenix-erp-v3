#!/usr/bin/env bash
set -euo pipefail

mode="${1:-}"
case "$mode" in --preflight|--execute|--verify) ;; *) echo 'usage: --preflight|--execute|--verify' >&2; exit 2;; esac
root="${REPAIR_BUNDLE_DIR:-.}"
base="$root/scripts/ops/packaging-grading-history-repair-20260910"
for file in "$base-preflight.sql" "$base-apply.sql" "$base-verify.sql"; do test -f "$file"; done

checkout_revision="$(git rev-parse HEAD)"
api_revision="$(docker inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$(docker compose ps -q api)")"
web_revision="$(docker inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$(docker compose ps -q web)")"
test "$checkout_revision" = "$api_revision"
test "$checkout_revision" = "$web_revision"
echo "PASS REVISION checkout=$checkout_revision api=$api_revision web=$web_revision"

psql_cmd=(docker compose exec -T db sh -c 'psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "$POSTGRES_DB"')
case "$mode" in
  --preflight)
    docker compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db sh -c \
      'psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$base-preflight.sql"
    ;;
  --verify)
    docker compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db sh -c \
      'psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$base-verify.sql"
    ;;
  --execute)
    test "${REPAIR_APPROVAL:-}" = 'APPROVE-PACKAGING-GRADING-HISTORY-REPAIR-20260910'
    "${psql_cmd[@]}" < "$base-apply.sql"
    ;;
esac

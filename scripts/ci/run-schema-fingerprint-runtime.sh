#!/usr/bin/env bash
set -Eeuo pipefail

: "${FINGERPRINT_SQL_FILE:?FINGERPRINT_SQL_FILE is required}"
: "${FINGERPRINT_PREFIX:?FINGERPRINT_PREFIX is required}"

sql="$(cat "$FINGERPRINT_SQL_FILE")"
out1="$(mktemp)"
out2="$(mktemp)"
trap 'rm -f "$out1" "$out2"' EXIT

psql -X -v ON_ERROR_STOP=1 -At -F $'\t' -c "$sql" >"$out1"
psql -X -v ON_ERROR_STOP=1 -At -F $'\t' -c "$sql" >"$out2"
test -s "$out1"
test -s "$out2"

hash1="$(sha256sum "$out1" | awk '{print $1}')"
hash2="$(sha256sum "$out2" | awk '{print $1}')"
test "$hash1" = "$hash2"

emit() {
  local key="$1" value="$2"
  echo "${key}=${value}"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "${key}=${value}" >>"$GITHUB_OUTPUT"; fi
}

emit "${FINGERPRINT_PREFIX}_RAW_HASH" "$hash1"
emit "${FINGERPRINT_PREFIX}_RAW_LINES" "$(wc -l <"$out1" | tr -d ' ')"
emit "${FINGERPRINT_PREFIX}_SCHEMA_SQL_B64" "$(base64 -w0 "$FINGERPRINT_SQL_FILE")"
for family in table column constraint index type; do
  count="$(awk -F '\t' -v family="$family" '$1 == family { count++ } END { print count + 0 }' "$out1")"
  family_hash="$(awk -F '\t' -v family="$family" '$1 == family { print }' "$out1" | sha256sum | awk '{print $1}')"
  upper="$(printf '%s' "$family" | tr '[:lower:]' '[:upper:]')"
  emit "${FINGERPRINT_PREFIX}_${upper}_COUNT" "$count"
  emit "${FINGERPRINT_PREFIX}_${upper}_HASH" "$family_hash"
done

attnotnull_sql="SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE a.attnum>0 AND NOT a.attisdropped AND a.attnotnull AND c.relkind='r' AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND c.relname NOT IN ('schema_migrations','migrations');"
notnull_constraint_sql="SELECT count(*) FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE con.contype='n' AND con.conrelid<>0 AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast') AND c.relname NOT IN ('schema_migrations','migrations');"
emit "${FINGERPRINT_PREFIX}_ATTNOTNULL_COUNT" "$(psql -X -v ON_ERROR_STOP=1 -At -c "$attnotnull_sql" | tr -d '\r\n[:space:]')"
emit "${FINGERPRINT_PREFIX}_RELATION_NOT_NULL_CONSTRAINT_COUNT" "$(psql -X -v ON_ERROR_STOP=1 -At -c "$notnull_constraint_sql" | tr -d '\r\n[:space:]')"
emit "${FINGERPRINT_PREFIX}_DETERMINISTIC" true

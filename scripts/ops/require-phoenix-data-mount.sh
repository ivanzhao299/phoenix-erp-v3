#!/usr/bin/env bash
# Fail closed when production is configured to use the /data-backed Phoenix
# volumes but the data disk is not mounted. Named-volume mode remains a no-op.
set -Eeuo pipefail

env_file="${PHOENIX_ENV_FILE:-.env}"
data_mount="${PHOENIX_DATA_MOUNT:-/data}"
sentinel="${PHOENIX_DATA_SENTINEL:-${data_mount}/.phoenix-data-volume}"

read_env_value() {
  local key="$1"
  [ -f "$env_file" ] || return 0
  awk -v key="$key" '
    $0 ~ "^[[:space:]]*" key "[[:space:]]*=" {
      sub(/^[^=]*=/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      if ($0 ~ /^".*"$/) {
        sub(/^"/, "")
        sub(/"$/, "")
      } else if ($0 ~ /^\047.*\047$/) {
        sub(/^\047/, "")
        sub(/\047$/, "")
      }
      print
      exit
    }
  ' "$env_file"
}

pg_dir="${PHOENIX_PG_DATA_DIR:-$(read_env_value PHOENIX_PG_DATA_DIR)}"
uploads_dir="${PHOENIX_UPLOADS_DIR:-$(read_env_value PHOENIX_UPLOADS_DIR)}"
guard="${PHOENIX_DATA_MOUNT_GUARD:-$(read_env_value PHOENIX_DATA_MOUNT_GUARD)}"

# A /data bind source always enables the guard. The explicit flag documents
# the intended production mode in .env, but cannot disable this safety check.
bind_configured=false
case "$pg_dir:$uploads_dir" in
  *"$data_mount/"*) bind_configured=true ;;
esac
case "$guard" in
  true|TRUE|1|yes|YES) bind_configured=true ;;
esac

if [ "$bind_configured" != true ]; then
  printf '%s\n' "Phoenix data mount guard disabled; named-volume mode remains active."
  exit 0
fi

fail() {
  printf 'ERROR: Phoenix data mount guard: %s\n' "$*" >&2
  exit 1
}

mountpoint -q -- "$data_mount" || fail "$data_mount is not a mounted filesystem"
test -f "$sentinel" || fail "missing sentinel $sentinel"

mount_target="$(findmnt -T "$data_mount" -no TARGET 2>/dev/null || true)"
[ "$mount_target" = "$data_mount" ] || fail "$data_mount resolves to mount target '$mount_target'"

[ -n "$pg_dir" ] || fail "PHOENIX_PG_DATA_DIR is missing from $env_file"
[ -n "$uploads_dir" ] || fail "PHOENIX_UPLOADS_DIR is missing from $env_file"

for path in "$pg_dir" "$uploads_dir"; do
  case "$path" in
    "$data_mount"/*) ;;
    *) fail "$path is outside $data_mount" ;;
  esac
  test -d "$path" || fail "$path does not exist as a directory"
  path_target="$(findmnt -T "$path" -no TARGET 2>/dev/null || true)"
  [ "$path_target" = "$data_mount" ] || fail "$path resolves to mount target '$path_target'"
done

printf '%s\n' "Phoenix data mount guard passed: $data_mount, $pg_dir, $uploads_dir"

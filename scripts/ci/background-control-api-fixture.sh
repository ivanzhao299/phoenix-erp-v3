#!/usr/bin/env bash
set -Eeuo pipefail
case "${1:-}" in start|cleanup) ;; *) echo 'CI_BACKGROUND_HOLD=OPERATION' >&2; exit 2;; esac
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
exec node "$script_dir/background-control-api-fixture.mjs" "$1"

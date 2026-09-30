#!/usr/bin/env bash
set -euo pipefail

# Runtime-only wrapper. The caller supplies extracted browser libraries via
# PLAYWRIGHT_LD_LIBRARY_PATH; this script never installs or modifies OS files.
if [[ -n "${PLAYWRIGHT_LD_LIBRARY_PATH:-}" ]]; then
  export LD_LIBRARY_PATH="${PLAYWRIGHT_LD_LIBRARY_PATH}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

exec pnpm --filter web exec playwright test "$@"

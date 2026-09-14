#!/usr/bin/env bash
# Run from apps/api. Keep a unique current-run artifact; never execute generated DDL.
set -euo pipefail
baseline=${1:?baseline path required}
evidence_parent=${2:?evidence parent required}
[[ -f "$baseline" ]] || { echo '::error::missing baseline'; exit 1; }
[[ "$(tr -d '[:space:]' < "$baseline")" =~ ^[0-9]+$ ]] || { echo '::error::invalid baseline'; exit 1; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
mkdir -p "$evidence_parent"
run_dir=$(mktemp -d "$evidence_parent/entity-gate.XXXXXXXX")
run_dir=$(cd "$run_dir" && pwd)
stamp=$(date +%s)000
artifact="$run_dir/${stamp}-EntityDrift.ts"
log="$run_dir/generator.log"
if NO_COLOR=1 FORCE_COLOR=0 ./node_modules/.bin/typeorm migration:generate "$run_dir/EntityDrift" -d dist/database/data-source.js --timestamp "$stamp" > "$log" 2> "$run_dir/generator.stderr.log"; then rc=0; else rc=$?; fi
printf '%s\n' "$rc" > "$run_dir/generator.exit"
echo "entity evidence: $run_dir; generator exit=$rc"
no_changes='No changes in database schema were found - cannot generate a migration. To create a new empty migration use "typeorm migration:create" command'
if [[ "$rc" = 1 && ! -s "$run_dir/generator.stderr.log" && ! -e "$artifact" && "$(cat "$log")" = "$no_changes" ]]; then
  echo 'entity generator explicitly reported no changes'; exit 0
fi
[[ "$rc" = 0 && -f "$artifact" ]] || { echo '::error::generator failed or current artifact missing; retained log'; exit 1; }
# A success marker and the exact artifact must agree; error output is never a zero-diff proof.
[[ "$(cat "$log")" = "Migration $artifact has been generated successfully." ]] || { echo '::error::unexpected generator output'; exit 1; }
bash "$script_dir/check-entity-drift-baseline.sh" "$baseline" "$artifact"

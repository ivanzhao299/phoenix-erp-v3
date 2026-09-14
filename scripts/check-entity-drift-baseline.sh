#!/usr/bin/env bash
# Only an explicit, existing artifact is accepted. Generator no-change is handled separately.
set -euo pipefail
baseline_file=${1:-.github/entity-drift-baseline.txt}
diff_file=${2:?explicit current-run diff file required}
[[ -f "$baseline_file" && -f "$diff_file" && ! -L "$diff_file" ]] || { echo '::error::missing baseline/current diff'; exit 1; }
baseline=$(tr -d '[:space:]' < "$baseline_file")
[[ "$baseline" =~ ^[0-9]+$ ]] || { echo '::error::invalid baseline'; exit 1; }
count=$(awk '/public async up/{up=1; seen=1} /public async down/{up=0; down=1} up && /await queryRunner/{n++} END{if (!seen || !down || !n) exit 1; print n}' "$diff_file") || { echo '::error::invalid or empty migration artifact'; exit 1; }
echo "entity drift: $count / baseline $baseline"
if (( count > baseline )); then echo '::error::entity drift exceeds baseline'; exit 1; fi

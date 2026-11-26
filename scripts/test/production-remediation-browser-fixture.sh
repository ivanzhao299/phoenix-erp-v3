#!/usr/bin/env bash
# Browser and HTTP fixtures share a private loopback database on the CI runner.
set -euo pipefail
root=$(pwd -P)
report_dir=${1:?evidence directory required}
mkdir -p "$report_dir"
report_dir=$(cd "$report_dir" && pwd -P)
export INSTALLMENT_HTTP_PORT=3188 INSTALLMENT_HTTP_URL=http://127.0.0.1:3188
export INSTALLMENT_WEB_URL=http://127.0.0.1:3088 NEXT_TELEMETRY_DISABLED=1
export API_TARGET="$INSTALLMENT_HTTP_URL"
(cd apps/web && exec ./node_modules/.bin/next dev --webpack -p 3088 -H 127.0.0.1) > "$report_dir/web.log" 2>&1 &
web_pid=$!
api_pid=
cleanup() {
  if [[ -n "$api_pid" ]]; then kill "$api_pid" 2>/dev/null || true; fi
  kill "$web_pid" 2>/dev/null || true
}
trap cleanup EXIT
for scenario in range installments reports cutover; do
  grain=0
  receipt=
  case "$scenario" in
    range) browser_script=production-workbench-range-browser.cjs ;;
    installments) browser_script=production-installments-browser.cjs; receipt=browser ;;
    reports) browser_script=production-reports-browser.cjs; receipt=browser-reports; grain=1 ;;
    cutover) browser_script=production-cutover-browser.cjs; receipt=browser-cutover ;;
  esac
  (
    cd apps/api
    export INSTALLMENT_HTTP_HOLD=1 INSTALLMENT_HTTP_GRAIN="$grain"
    exec ./node_modules/.bin/jest --runInBand --testTimeout=60000 --runTestsByPath \
      src/modules/sales-v2/services/production-inbound-http.pg.spec.ts -t 'preserves exact decimal opening prices'
  ) > "$report_dir/$scenario-api.log" 2>&1 &
  api_pid=$!
  for ((attempt=0; attempt<180; attempt++)); do
    if grep -q 'Owned installment HTTP fixture ready' "$report_dir/$scenario-api.log"; then break; fi
    kill -0 "$api_pid"
    sleep 1
  done
  grep -q 'Owned installment HTTP fixture ready' "$report_dir/$scenario-api.log"
  curl --retry 30 --retry-connrefused --retry-delay 1 -sS -o /dev/null "$INSTALLMENT_WEB_URL/favicon.ico"
  if [[ -n "$receipt" ]]; then
    receipt="$root/artifacts/production-inbound-installments-20261118/$receipt/receipt.json"
    rm -f -- "$receipt"
  fi
  node "$root/scripts/test/$browser_script" | tee "$report_dir/$scenario-browser.log"
  if [[ -n "$receipt" ]]; then
    node -e '
      const { readFileSync } = require("node:fs");
      const assert = require("node:assert/strict");
      assert.equal(JSON.parse(readFileSync(process.argv[1], "utf8")).complete, true, process.argv[1]);
    ' "$receipt"
  fi
  curl --fail --silent --show-error -o /dev/null -H 'content-type: application/json' \
    --data '{"password":"owned-fixture"}' "$INSTALLMENT_HTTP_URL/api/auth/fixture-finish"
  wait "$api_pid"
  api_pid=
done

(
  cd apps/api
  EGG_SOURCE_BROWSER_URL="$INSTALLMENT_WEB_URL" EGG_SOURCE_HTTP_PORT="$INSTALLMENT_HTTP_PORT" \
    ./node_modules/.bin/jest --runInBand --testTimeout=90000 --runTestsByPath \
    src/modules/product-master/services/egg-source-change.pg.spec.ts
) | tee "$report_dir/egg-source-real-browser.log"

(
  cd apps/web
  PLAYWRIGHT_BASE_URL="$INSTALLMENT_WEB_URL" ./node_modules/.bin/playwright test e2e/egg-source-workspace.spec.ts e2e/production-operator-feedback.spec.ts \
    --workers=1 --reporter=line --output="$report_dir/egg-source-browser-artifacts"
) | tee "$report_dir/egg-source-browser.log"

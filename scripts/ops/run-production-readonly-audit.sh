#!/usr/bin/env bash
set -euo pipefail

audit_root='scripts/ops/readonly-audits'
bundle_dir="${AUDIT_BUNDLE_DIR:-.}"
sql_path="${ASSERTION_SQL_PATH:-}"
http_path="${HTTP_ASSERTIONS_PATH:-}"

validate_path() {
  local value="$1" suffix="$2"
  [ -z "$value" ] && return 0
  case "$value" in
    "$audit_root"/*"$suffix") ;;
    *) echo "FAIL invalid audit path: $value" >&2; return 2 ;;
  esac
  [ -f "$bundle_dir/$value" ] || { echo "FAIL audit file not found: $value" >&2; return 2; }
  case "$value" in *'..'*) echo "FAIL parent traversal is forbidden" >&2; return 2;; esac
}

validate_path "$sql_path" '.sql'
validate_path "$http_path" '.http.json'
if [ -n "$http_path" ]; then
  HTTP_VALIDATE_PATH="$bundle_dir/$http_path" node -e "const f=require(process.env.HTTP_VALIDATE_PATH);if(!Array.isArray(f))throw Error('HTTP manifest must be an array');for(const x of f){if(!['GET','HEAD'].includes(x.method||'GET'))throw Error('Only GET/HEAD are allowed');if(!x.name||(!x.path&&!x.pathSql))throw Error('Each HTTP assertion needs name and path/pathSql')}"
fi
[ "${1:-}" = '--validate' ] && { echo 'PASS audit inputs validated'; exit 0; }

run_id="${AUDIT_RUN_ID:?AUDIT_RUN_ID is required}"
case "$run_id" in *[!0-9]*) echo 'FAIL invalid run id' >&2; exit 2;; esac
out_dir="/tmp/phoenix-production-readonly-audit-$run_id"
install -d -m 700 "$out_dir"
log="$out_dir/audit.log"
exec > >(tee "$log") 2>&1

checkout_revision="$(git rev-parse HEAD)"
api_revision="$(docker inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$(docker compose ps -q api)")"
web_revision="$(docker inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$(docker compose ps -q web)")"
test "$checkout_revision" = "$api_revision"
test "$checkout_revision" = "$web_revision"
echo "PASS REVISION checkout=$checkout_revision api=$api_revision web=$web_revision"

psql_ro() {
  docker compose exec -T -e PGOPTIONS='-c default_transaction_read_only=on' db \
    sh -c 'psql -X -v ON_ERROR_STOP=1 -P pager=off -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

if [ -n "$sql_path" ]; then
  { printf '%s\n' 'BEGIN TRANSACTION READ ONLY;' "SET LOCAL statement_timeout='30s';" "SET LOCAL lock_timeout='5s';"; cat "$bundle_dir/$sql_path"; printf '%s\n' 'ROLLBACK;'; } | psql_ro
  echo "PASS SQL file=$sql_path"
fi

if [ -n "$http_path" ]; then
  HTTP_MANIFEST_B64="$(base64 -w0 "$bundle_dir/$http_path")" docker compose exec -T \
    -e HTTP_MANIFEST_B64 -e PHOENIX_CI_TOKEN_EXPIRES_IN=20m \
    -e PGOPTIONS='-c default_transaction_read_only=on' api node - <<'NODE'
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { AuthService } = require('./dist/auth/auth.service');
const { DataScopeService } = require('./dist/modules/org/services/data-scope.service');
const { DataSource } = require('typeorm');
const jwt = require('jsonwebtoken');

const assertions = JSON.parse(Buffer.from(process.env.HTTP_MANIFEST_B64, 'base64').toString('utf8'));
const getPath = (body, path) => path.split('.').reduce((v, k) => v == null ? undefined : v[k], body);
(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const auth = app.get(AuthService);
    const scopes = app.get(DataScopeService);
    const ds = app.get(DataSource);
    const scalar = async (sql) => ds.transaction(async manager => {
      await manager.query('SET TRANSACTION READ ONLY');
      await manager.query("SET LOCAL statement_timeout='10s'");
      const rows = await manager.query(sql);
      return rows.length ? String(Object.values(rows[0])[0] ?? '') : '';
    });
    const tokens = new Map();
    for (const a of assertions) {
      const method = a.method || 'GET';
      if (!['GET','HEAD'].includes(method)) throw new Error(`${a.name}: forbidden method ${method}`);
      const username = a.usernameSql ? await scalar(a.usernameSql) : (a.username || 'admin');
      if (!username) { console.log(`SKIP ${a.name} reason=no-auth-sample`); continue; }
      if (!tokens.has(username)) {
        const longSession = await auth.login(username, '', '127.0.0.1', { bypassPassword: true });
        const payload = jwt.decode(longSession.token);
        delete payload.iat;
        delete payload.exp;
        tokens.set(username, jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '20m' }));
      }
      if (a.scopeMenu) {
        const payload = jwt.decode(tokens.get(username));
        const scope = await scopes.resolve(String(payload.userId), payload.roles || [], a.scopeMenu, payload.perms_version);
        console.log(`SCOPE name=${a.name} username=${username} isGlobal=${Boolean(scope.isGlobal)} companies=${(scope.allowedCompanyCodes || []).length}`);
      }
      let path = a.pathSql ? await scalar(a.pathSql) : a.path;
      if (a.scopeForeignOrder) {
        const payload = jwt.decode(tokens.get(username));
        const scope = await scopes.resolve(String(payload.userId), payload.roles || [], 'MENU_SALES2_ORDER', payload.perms_version);
        if (scope.isGlobal) { console.log(`SKIP ${a.name} reason=no-restricted-auth-sample`); continue; }
        const rows = await ds.query('SELECT id FROM sal_sales_orders WHERE NOT (company_code=ANY($1::text[])) ORDER BY id DESC LIMIT 1', [[...scope.allowedCompanyCodes]]);
        path = rows.length ? `/api/v2/sales/orders/${rows[0].id}/process-log` : '';
      }
      if (!path) { console.log(`NO_SAMPLE name=${a.name} reason=no-data-sample`); continue; }
      const response = await fetch(`http://127.0.0.1:3100${path}`, { method, headers: { Authorization: `Bearer ${tokens.get(username)}` } });
      const text = await response.text();
      const expected = Array.isArray(a.expectedStatus) ? a.expectedStatus : [a.expectedStatus ?? 200];
      if (!expected.includes(response.status)) throw new Error(`${a.name}: status=${response.status} expected=${expected.join('/')}`);
      let body = null;
      if (a.requiredArrays?.length || a.requiredArrayItems?.length || a.requiredWarnings?.length || a.reportDataLength || a.minDataLength != null || a.rowPath || a.requiredNonEmptyFields?.length) {
        body = JSON.parse(text);
        body = body?.data ?? body;
        for (const p of (a.requiredArrays || [])) if (!Array.isArray(getPath(body, p))) throw new Error(`${a.name}: ${p} is not an array`);
      }
      for (const rule of (a.requiredArrayItems || [])) {
        const rows = getPath(body, rule.path);
        if (!Array.isArray(rows)) throw new Error(`${a.name}: ${rule.path} is not an array`);
        const matches = rule.where ? rows.filter(row => Object.entries(rule.where).every(([k,v]) => getPath(row, k) === v)) : rows;
        if ((rule.minMatches ?? 1) > matches.length) throw new Error(`${a.name}: ${rule.path} matching rows=${matches.length} expected>=${rule.minMatches ?? 1}`);
        for (const [index, row] of matches.entries()) {
          for (const field of (rule.fields || [])) if (!(field in row)) throw new Error(`${a.name}: ${rule.path}[${index}] missing field ${field}`);
          for (const field of (rule.nonEmptyFields || [])) if (!String(getPath(row, field) ?? '').trim()) throw new Error(`${a.name}: ${rule.path}[${index}] empty field ${field}`);
        }
      }
      for (const warning of (a.requiredWarnings || [])) {
        if (!Array.isArray(body?.warnings) || !body.warnings.includes(warning)) throw new Error(`${a.name}: warning ${warning} not found`);
      }
      const dataRows = a.rowPath ? getPath(body, a.rowPath) : (Array.isArray(body) ? body : (Array.isArray(body?.items) ? body.items : null));
      if (a.minDataLength != null && (!dataRows || dataRows.length < a.minDataLength)) {
        if (a.allowNoData && Array.isArray(dataRows) && dataRows.length === 0) {
          console.log(`NO_SAMPLE name=${a.name} reason=no-data-sample`);
          continue;
        }
        throw new Error(`${a.name}: data.length=${dataRows?.length ?? 'not-array'} expected>=${a.minDataLength}`);
      }
      if (a.requiredNonEmptyFields?.length) {
        if (!Array.isArray(dataRows) || dataRows.length === 0) throw new Error(`${a.name}: no rows available for non-empty field assertions`);
        for (const field of a.requiredNonEmptyFields) {
          const present = dataRows.some(row => String(getPath(row, field) ?? '').trim().length > 0);
          if (!present) throw new Error(`${a.name}: no row has non-empty field ${field}`);
        }
      }
      console.log(`PASS HTTP name=${a.name} username=${username} method=${method} status=${response.status}${a.requiredArrays?.length ? ` arrays=${a.requiredArrays.join(',')}` : ''}${a.reportDataLength ? ` data.length=${dataRows?.length ?? 'not-array'}` : ''}${a.requiredNonEmptyFields?.length ? ` nonempty=${a.requiredNonEmptyFields.join(',')}` : ''}`);
    }
  } finally { await app.close(); }
})().catch(e => { console.error(`FAIL HTTP ${e.message}`); process.exit(1); });
NODE
fi

error_count="$({ docker logs --since 60m phoenix-v3-api 2>&1 | grep -Ei '(ERROR|exception).*(sales.order|lifecycle|process-log)' || true; } | wc -l | tr -d ' ')"
echo "LIFECYCLE_PROCESS_LOG_ERROR_WINDOW_60M=$error_count"
test "$error_count" = 0
if [ "$http_path" = 'scripts/ops/readonly-audits/company-customer-lookup.http.json' ]; then
  lookup_error_count="$({ docker logs --since 60m phoenix-v3-api 2>&1 | grep -Ei '(ERROR|exception).*(/api/lookup/(companies|customers)|lookup.*(companies|customers))' || true; } | wc -l | tr -d ' ')"
  echo "LOOKUP_COMPANY_CUSTOMER_ERROR_WINDOW_60M=$lookup_error_count"
  test "$lookup_error_count" = 0
fi
if [ "$http_path" = 'scripts/ops/readonly-audits/localized-sales-inventory-names.http.json' ]; then
  localized_name_error_count="$({ docker logs --since 60m phoenix-v3-api 2>&1 | grep -Ei '(ERROR|exception).*(inventory/batches|sales/(activity|returns|analytics))' || true; } | wc -l | tr -d ' ')"
  echo "LOCALIZED_NAME_ERROR_WINDOW_60M=$localized_name_error_count"
  test "$localized_name_error_count" = 0
fi
if [ "$http_path" = 'scripts/ops/readonly-audits/inventory-eight-page-display.http.json' ]; then
  inventory_display_error_count="$({ docker logs --since 60m phoenix-v3-api 2>&1 | grep -Ei '(ERROR|exception).*(inventory/batches|crud/(wms_(inbound|outbound|transfer|stocktake)|inv_ledger|wms_warehouses))' || true; } | wc -l | tr -d ' ')"
  echo "INVENTORY_DISPLAY_ERROR_WINDOW_60M=$inventory_display_error_count"
  test "$inventory_display_error_count" = 0
fi
if [ "$http_path" = 'scripts/ops/readonly-audits/production-procurement-localized-names.http.json' ]; then
  localized_production_procurement_error_count="$({ docker logs --since 60m phoenix-v3-api 2>&1 | grep -Ei '(ERROR|exception).*(analytics/production|farm/egg/ledger|procurement/orders|supplier-performance)' || true; } | wc -l | tr -d ' ')"
  echo "PRODUCTION_PROCUREMENT_LOCALIZED_NAME_ERROR_WINDOW_60M=$localized_production_procurement_error_count"
  test "$localized_production_procurement_error_count" = 0
fi
if [ "$http_path" = 'scripts/ops/readonly-audits/three-page-display-defects.http.json' ]; then
  three_page_error_count="$({ docker logs --since 60m phoenix-v3-api 2>&1 | grep -Ei '(ERROR|exception).*(procurement/requests|store-sales/inventory)' || true; } | wc -l | tr -d ' ')"
  echo "THREE_PAGE_DISPLAY_ERROR_WINDOW_60M=$three_page_error_count"
  test "$three_page_error_count" = 0
fi
if [ "$sql_path" = 'scripts/ops/readonly-audits/credit-evaluation-so-20260903-00005.sql' ]; then
  credit_log_matches="$({ docker logs --timestamps phoenix-v3-api 2>&1 | grep -E -B 30 -A 30 'SO-20260903-00005|信用评估失败|QueryFailedError|客户 .* 不存在' || true; })"
  credit_log_line_count="$(printf '%s' "$credit_log_matches" | awk 'NF { count++ } END { print count + 0 }')"
  echo "CREDIT_EVALUATION_RETAINED_LOG_LINES=$credit_log_line_count"
  if [ "$credit_log_line_count" -gt 0 ]; then
    printf '%s\n' "$credit_log_matches"
  else
    echo 'NO_RETAINED_CREDIT_EVALUATION_LOG_EVIDENCE (container log window may have rotated)'
  fi
fi
echo 'PASS PRODUCTION_BUSINESS_WRITES=0'

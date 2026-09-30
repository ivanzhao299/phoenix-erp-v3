#!/usr/bin/env bash
set -euo pipefail
if [[ "${E2E_DB:-}" != "1" || "${NODE_ENV:-}" != "test" ]]; then
  echo "seed-e2e-replenishment-users requires E2E_DB=1 and NODE_ENV=test" >&2; exit 1
fi
PSQL_BIN="${PSQL_BIN:-psql}"; PSQL=("$PSQL_BIN" -X -v ON_ERROR_STOP=1)
if [[ -n "${DATABASE_URL:-}" ]]; then PSQL+=("$DATABASE_URL"); fi
PASSWORD="${E2E_TEST_PASSWORD:-e2e-pass-33100}"
HASH="$(node -e "require('./apps/api/node_modules/bcrypt').hash(process.argv[1], 4).then(console.log)" "$PASSWORD")"
"${PSQL[@]}" -v e2e_hash="$HASH" <<'SQL'
BEGIN;
INSERT INTO sys_organizations (org_code,org_name,org_type,level,status,company_code)
VALUES ('E2E-COMPANY','E2E company','COMPANY',1,'ACTIVE','E2E-COMPANY')
ON CONFLICT (org_code) DO UPDATE SET status='ACTIVE',company_code='E2E-COMPANY';
INSERT INTO sys_user (username,password_hash,real_name,store_code,status)
VALUES ('E2E_REPLENISH_MANAGER', :'e2e_hash','E2E Replenishment Manager','E2E-REPLENISH-STORE',1),
       ('E2E_REPLENISH_WMS', :'e2e_hash','E2E Replenishment WMS','ALL',1),
       ('E2E_ADMIN', :'e2e_hash','E2E Admin','ALL',1)
ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash,status=1;
INSERT INTO sys_user_role (user_id,role_id,is_primary,is_visible)
SELECT u.user_id,r.role_id,true,true FROM sys_user u JOIN sys_role r ON r.role_code=CASE u.username WHEN 'E2E_REPLENISH_MANAGER' THEN 'ROLE_STORE_MGR' WHEN 'E2E_REPLENISH_WMS' THEN 'ROLE_WMS_OP' ELSE 'ROLE_ADMIN' END
WHERE u.username IN ('E2E_REPLENISH_MANAGER','E2E_REPLENISH_WMS','E2E_ADMIN')
ON CONFLICT (user_id,role_id) DO UPDATE SET is_primary=true,is_visible=true;
INSERT INTO sys_user_orgs (user_id,org_id,is_primary,data_scope_level,org_code)
SELECT u.user_id,o.id,true,'COMPANY','E2E-COMPANY' FROM sys_user u CROSS JOIN sys_organizations o
WHERE u.username IN ('E2E_REPLENISH_MANAGER','E2E_REPLENISH_WMS') AND o.org_code='E2E-COMPANY'
ON CONFLICT (user_id,org_id) DO UPDATE SET data_scope_level='COMPANY',org_code='E2E-COMPANY';
INSERT INTO store_memberships (user_id,store_id,role,effective_from,status)
SELECT u.user_id,s.id,'STORE_MANAGER',CURRENT_DATE,'ACTIVE' FROM sys_user u CROSS JOIN store_master s
WHERE u.username='E2E_REPLENISH_MANAGER' AND s.store_code='E2E-REPLENISH-STORE'
ON CONFLICT DO NOTHING;
INSERT INTO sys_user_warehouse_scopes (user_id,warehouse_code) SELECT u.user_id,w.warehouse_code FROM sys_user u CROSS JOIN (VALUES ('E2E-REPLENISH-SRC'),('E2E-REPLENISH-TGT')) w(warehouse_code) WHERE u.username IN ('E2E_REPLENISH_MANAGER','E2E_REPLENISH_WMS') ON CONFLICT DO NOTHING;
COMMIT;
SQL

# BUGTASK-20260707-0002 · A5 Data Readiness Report

Agent: A5-Data-Readiness  
Date: 2026-07-07  
Branch: `w5-a5-data-readiness`  
Route: `/warehouse`  
Bug: BUG-20260707-0002  
Title: 打开库存总览报错403

## Scope

This report is limited to dry-run diagnosis, read-only baseline checks, data-readiness evidence, and docs/ops reporting.

No business code, migration, schema, entity, table, column, seed, deployment, task board update, push, or database write was performed.

## Environment Gate

Required read-only commands executed:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
```

Results:

- `pwd`: `/Users/mac/phoenix-erp-worktrees/a5-data-readiness`
- Branch: `w5-a5-data-readiness`
- Worktree cleanliness at start: clean
- Recent HEAD: `00776ffa (HEAD -> w5-a5-data-readiness) docs(ops): record baseline lifecycle report`

Gate result: PASS.

## Data Sources Inspected

- Bug intake JSON snapshot for `/warehouse`
- Local evidence path supplied by intake:
  `/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260707-082222/BUG-20260707-0002/attachments/01-1783383618124-3188771d.png`
- `apps/web/src/app/(admin)/warehouse/page.tsx`
- `apps/web/src/components/layout/Sidebar.tsx`
- `apps/api/src/modules/generic-crud/generic-crud.controller.ts`
- `apps/api/src/common/guards/menu.guard.ts`
- `apps/api/src/common/guards/menu-registry.service.ts`
- `apps/api/migrations/20260606_g5a_rbac_matrix_backfill.sql`
- `apps/api/migrations/20260608_g34_wangweihua_treasurer_seed.sql`
- `apps/api/migrations/20260614_g115_user_role_refinement.sql`
- `docs/rbac-production-hardening-audit.md`

Read-only commands executed:

```bash
rg -n "warehouse|wms_zones|wms_inbound|wms_outbound|MENU_WMS_INOUT|库存总览|仓库看板" apps docs scripts
rg --files docs scripts apps/web apps/api | rg "(warehouse|wms|rbac|permission|data-readiness|bug|ops|baseline|menu|role)"
nl -ba 'apps/web/src/app/(admin)/warehouse/page.tsx' | sed -n '90,125p'
nl -ba apps/web/src/components/layout/Sidebar.tsx | sed -n '96,124p'
nl -ba apps/web/src/components/layout/Sidebar.tsx | sed -n '300,390p'
nl -ba apps/api/src/modules/generic-crud/generic-crud.controller.ts | sed -n '1,150p'
nl -ba apps/api/src/modules/generic-crud/generic-crud.controller.ts | sed -n '150,230p'
nl -ba apps/api/src/common/guards/menu.guard.ts | sed -n '1,260p'
nl -ba apps/api/src/common/guards/menu-registry.service.ts | sed -n '1,260p'
rg -n "ROLE_MENGSAI_DONGPENG_TREASURER|MENU_WMS_VIEW|MENU_WMS_INOUT|MENU_WMS_MASTER|wangweihua" apps/api/migrations apps/api/src/database/migrations apps/api/scripts docs/ops/runs/remediation-r3-menu-role-datascope-repair-execution-20260624-134210
nl -ba apps/api/migrations/20260606_g5a_rbac_matrix_backfill.sql | sed -n '236,250p'
nl -ba apps/api/migrations/20260614_g115_user_role_refinement.sql | sed -n '34,45p'
nl -ba apps/api/migrations/20260608_g34_wangweihua_treasurer_seed.sql | sed -n '96,118p'
which psql
test -x /Applications/Postgres.app/Contents/Versions/latest/bin/psql && echo postgresapp-psql-present || echo postgresapp-psql-missing
/opt/homebrew/bin/psql -U mac -d phoenix_erp -Atc "select current_database(), current_user, current_date;"
/opt/homebrew/bin/psql -U mac -d phoenix_erp -Atc "select u.username, r.role_code, m.menu_code, p.perm_codes from sys_user u join sys_user_role ur on ur.user_id=u.user_id join sys_role r on r.role_id=ur.role_id left join sys_role_menu_permission p on p.role_id=r.role_id left join sys_menu m on m.menu_id=p.menu_id where u.username='wangweihua' and (m.menu_code like 'MENU_WMS%' or m.menu_code like 'MENU_INV%' or m.menu_code is null) order by r.role_code, m.menu_code;"
/opt/homebrew/bin/psql -U mac -d phoenix_erp -Atc "select table_name, count(*) from (select 'wms_zones' table_name from wms_zones union all select 'wms_inbound' from wms_inbound union all select 'wms_outbound' from wms_outbound union all select 'inv_batches' from inv_batches) s group by table_name order by table_name;"
docker compose ps
date '+%Y-%m-%d %H:%M:%S %Z'
git status --short
```

## Baseline Findings

1. The bug snapshot already identifies the failing read endpoints.
   - Failed requests:
     - `GET /api/crud/wms_zones?limit=100&offset=0` -> 403
     - `GET /api/crud/wms_inbound?limit=200&offset=0` -> 403
     - `GET /api/crud/wms_outbound?limit=200&offset=0` -> 403
   - Response says role `ROLE_MENGSAI_DONGPENG_TREASURER` needs `menu=MENU_WMS_INOUT`.

2. `/warehouse` dashboard currently reads those three Generic CRUD tables on page load.
   - `apps/web/src/app/(admin)/warehouse/page.tsx:104-111` calls:
     - `crudApi.list("wms_zones", { limit: 100 })`
     - `crudApi.list("wms_inbound", { limit: 200 })`
     - `crudApi.list("wms_outbound", { limit: 200 })`
     - `crudApi.list("inv_batches", { limit: 500 })`
   - The page catches failures and substitutes empty arrays, so the UI can render while the browser still records 403 failed requests.

3. Sidebar visibility and API access use different effective permissions for the same route.
   - `apps/web/src/components/layout/Sidebar.tsx:106-108` exposes `/warehouse` and "库存总览" with `MENU_WMS_VIEW`.
   - `apps/web/src/components/layout/Sidebar.tsx:306-314` filters visible menu items by the leaf `perm`.
   - Therefore a user with `MENU_WMS_VIEW` can see and open `/warehouse`.

4. Generic CRUD maps all `wms_*` table access, including GET, to `MENU_WMS_INOUT`.
   - `apps/api/src/modules/generic-crud/generic-crud.controller.ts:94-103` maps GET to required op `V` and throws 403 if the JWT lacks the fallback menu permission.
   - `apps/api/src/modules/generic-crud/generic-crud.controller.ts:125-127` maps:
     - `inv_batches` / `inv_ledger` -> `MENU_WMS_VIEW`
     - other `inv_*` -> `MENU_WMS_VIEW`
     - all `wms_*` -> `MENU_WMS_INOUT`
   - This explains the exact intake response: dashboard visible by `MENU_WMS_VIEW`, but `wms_zones`, `wms_inbound`, and `wms_outbound` reads require `MENU_WMS_INOUT:V`.

5. Static role baseline supports the 403 for 王玮华.
   - `apps/api/migrations/20260614_g115_user_role_refinement.sql:40` sets `wangweihua` primary role to `ROLE_MENGSAI_DONGPENG_TREASURER`.
   - `apps/api/migrations/20260608_g34_wangweihua_treasurer_seed.sql:97-114` grants the treasurer role finance/workflow/cash permissions, not WMS permissions.
   - `apps/api/migrations/20260606_g5a_rbac_matrix_backfill.sql:244` grants `ROLE_FIN_ACCT` `MENU_WMS_VIEW:V,X`, but no adjacent static grant for `MENU_WMS_INOUT`.
   - The reported user also has `ROLE_FIN_ACCT`; that secondary role can explain sidebar visibility, but not Generic CRUD access to `wms_*`.

6. Existing RBAC hardening documentation had already identified this class of issue.
   - `docs/rbac-production-hardening-audit.md:420-424` records `/warehouse` as `MENU_WMS_VIEW` on Sidebar with backend WMS/API permission inconsistency.
   - `docs/rbac-production-hardening-audit.md:501` records WMS menu mismatch as critical risk for non-admin users.

7. No data baseline defect is proven by this A5 run.
   - The observed failure occurs before data contents matter: RBAC rejects the request.
   - No evidence indicates missing `wms_zones`, `wms_inbound`, `wms_outbound`, or `inv_batches` rows are the cause of the bug.
   - A data seed, migration, schema change, or table/entity edit would be outside A5 scope and is not justified by the current evidence.

## Read-Only DB Evidence Attempt

Attempted local read-only SQL:

```bash
/opt/homebrew/bin/psql -U mac -d phoenix_erp -Atc "select current_database(), current_user, current_date;"
/opt/homebrew/bin/psql -U mac -d phoenix_erp -Atc "select u.username, r.role_code, m.menu_code, p.perm_codes from sys_user u join sys_user_role ur on ur.user_id=u.user_id join sys_role r on r.role_id=ur.role_id left join sys_role_menu_permission p on p.role_id=r.role_id left join sys_menu m on m.menu_id=p.menu_id where u.username='wangweihua' and (m.menu_code like 'MENU_WMS%' or m.menu_code like 'MENU_INV%' or m.menu_code is null) order by r.role_code, m.menu_code;"
/opt/homebrew/bin/psql -U mac -d phoenix_erp -Atc "select table_name, count(*) from (select 'wms_zones' table_name from wms_zones union all select 'wms_inbound' from wms_inbound union all select 'wms_outbound' from wms_outbound union all select 'inv_batches' from inv_batches) s group by table_name order by table_name;"
```

Result:

```text
psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: Operation not permitted
Is the server running locally and accepting connections on that socket?
```

No SQL reached the database. No read or write occurred through `psql`.

Attempted container status check:

```bash
docker compose ps
```

Result:

```text
zsh:1: command not found: docker
```

## Blockers

- Local DB socket access is blocked by `Operation not permitted`, so A5 could not prove live row counts or live role-menu rows.
- `docker` is unavailable in this shell, so A5 could not inspect a local Compose database container.
- Production database was not queried, by guardrail.
- Fixing the acceptance criteria requires A2/A3/A4 decisions about RBAC/API/UI behavior, not an A5 data write.

## Required User Decisions

- Whether `/warehouse` is intended to be visible to finance/treasurer users with only `MENU_WMS_VIEW`.
- If yes, A3/A2 should make dashboard read APIs require only view permission for read-only tables or use a dedicated read endpoint with `MENU_WMS_VIEW`, while preserving stricter write permissions for WMS operations.
- If no, A4/A2 should hide `/warehouse` for users lacking the actual API-required permission, satisfying the acceptance criterion: "若没有权限查看直接隐藏左侧菜单".
- Whether `wms_zones` master-data reads should be separated from in/out operation permission. Current fallback maps `wms_zones` GET to `MENU_WMS_INOUT`, which is stricter than its read-only dashboard use.
- Whether to rerun a DB-accessible read-only baseline before release using:

```sql
SELECT u.username, r.role_code, m.menu_code, p.perm_codes
FROM sys_user u
JOIN sys_user_role ur ON ur.user_id = u.user_id
JOIN sys_role r ON r.role_id = ur.role_id
LEFT JOIN sys_role_menu_permission p ON p.role_id = r.role_id
LEFT JOIN sys_menu m ON m.menu_id = p.menu_id
WHERE u.username = 'wangweihua'
  AND (m.menu_code LIKE 'MENU_WMS%' OR m.menu_code LIKE 'MENU_INV%' OR m.menu_code IS NULL)
ORDER BY r.role_code, m.menu_code;

SELECT 'wms_zones' AS table_name, COUNT(*) FROM wms_zones
UNION ALL SELECT 'wms_inbound', COUNT(*) FROM wms_inbound
UNION ALL SELECT 'wms_outbound', COUNT(*) FROM wms_outbound
UNION ALL SELECT 'inv_batches', COUNT(*) FROM inv_batches;
```

## Changed Files

- `docs/ops/BUGTASK-20260707-0002_A5_DATA_READINESS_REPORT.md`

## Validation Commands

Executed:

```bash
git status --short
date '+%Y-%m-%d %H:%M:%S %Z'
```

Not executed by A5:

- API/Web `tsc`: no business code changed in this A5 run.
- Runtime browser smoke: outside A5 data-readiness scope and needs A4 after repair.
- Migration or seed commands: forbidden by contract.

## Recommendation

PASS WITH CONDITIONS for A5 data readiness diagnosis.

GO/HOLD: HOLD for release until A2/A3/A4 repair the permission contract and A1 validates the route.

Reasoning:

- The failure is explained by RBAC/API contract mismatch, not by missing data readiness evidence.
- Granting data, running seeds, or applying migrations is not indicated.
- A5 static evidence is sufficient to route the fix: `/warehouse` is visible under `MENU_WMS_VIEW`, but its dashboard reads `wms_*` Generic CRUD endpoints requiring `MENU_WMS_INOUT:V`.

Suggested next owners:

- A2-Security-Regression-Gate: decide least-privilege permission model and ensure RBAC/DataScope is preserved.
- A3-Backend-Critical-Path: adjust read permission mapping or provide a view-only dashboard endpoint if approved.
- A4-Frontend-UAT-Smoke: hide menu/tiles when the user lacks required permission, or verify successful dashboard load for users granted view access.
- A1-CI-Runtime-Gate: run typecheck and route smoke after repair.

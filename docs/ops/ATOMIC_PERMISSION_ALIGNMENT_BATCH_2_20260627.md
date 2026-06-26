# Atomic Permission Alignment Batch 2 - 2026-06-27

## Goal

Continue the global RBAC cleanup by removing remaining coarse parent permission fallbacks from high-risk runtime paths and adding a repeatable role-permission matrix audit.

## Scope

- Procurement dashboard backend gates.
- Finance dashboard backend gates.
- Workflow / approval / notification backend gates.
- Generic CRUD table-to-menu fallback gates.
- Shared upload endpoint module fallback gates.
- Fallback menu registry for recently introduced atomic menu codes.
- CI regression check for coarse permission fallback.
- Read-only role permission matrix audit.

## Code Changes

### 1. Generic CRUD No Longer Falls Back To Parent Finance / Procurement / Master Menus

`apps/api/src/modules/generic-crud/generic-crud.controller.ts` now maps only known safe tables to specific leaf menu codes.

Examples:

- `sys_role`, `sys_role_menu_permission`, `sys_menu` -> `MENU_SETTINGS_ROLE`
- `sys_user` -> `MENU_SETTINGS_USER`
- `sys_dict` -> `MENU_SYS_DICT`
- `sys_approval_log`, `sys_audit_log` -> `MENU_SETTINGS_AUDIT`
- `pda_terminals` -> `MENU_SETTINGS_TERMINAL`
- `fin_cash_*` -> `MENU_FIN2_CASH_VIEW`
- `prc_purchase_requests` -> `MENU_PRC2_REQUEST`
- `prc_purchase_payments` -> `MENU_PRC2_PAYMENT`
- `prc_receipts` -> `MENU_PRC2_RECEIPT`
- `mst_stores` -> `MENU_MD_STORE`

Unknown legacy `fin_*`, `prc_*`, `prc2_*`, and `mst_*` tables no longer resolve to `MENU_FIN2`, `MENU_PRC2`, or `MENU_MASTER`.

### 2. Dashboard And Workflow Parent Fallbacks Removed

- Procurement dashboard removed `MENU_PRC2` parent fallback.
- Finance dashboard removed `MENU_FIN2` parent fallback.
- Workflow runtime, workflow task, approval engine, and notification controllers removed `MENU_WORKFLOW` parent fallback.

### 3. Shared Upload Endpoint Uses Leaf Module Permissions

`POST /api/upload/contract` no longer uses `MENU_PRC2_MASTER` or `MENU_WORKFLOW` fallback.

Allowed leaf fallbacks remain module-specific:

- `MENU_PRC2_REQUEST`
- `MENU_PRC2_PAYMENT`
- `MENU_FIN2_SHAREHOLDER`
- `MENU_FIN2_EXPENSE`
- `MENU_FIN2_REIMBURSE`
- `MENU_FIN2_AP`
- `MENU_STORE_PAYMENT`
- `MENU_WORKFLOW_FORM`

### 4. Fallback Menu Registry Updated

`menu-registry.service.ts` fallback snapshot now includes the newer atomic menus used by current code:

- Workflow atomics: `MENU_WORKFLOW_TODO`, `MENU_WORKFLOW_HISTORY`, `MENU_WORKFLOW_NOTIFY`, `MENU_WORKFLOW_CONFIG`, `MENU_WORKFLOW_RULES`, `MENU_WORKFLOW_FORM`, `MENU_WORKFLOW_METRICS`
- Master data: `MENU_MD_BANK_ACCOUNT`
- Settings atomics: `MENU_SETTINGS_ROLE`, `MENU_SETTINGS_PERMISSION_SET`, `MENU_SETTINGS_SECURITY`, `MENU_SETTINGS_AUDIT`, `MENU_SETTINGS_BRAND`, `MENU_SETTINGS_TERMINAL`, `MENU_SETTINGS_POS`, `MENU_SETTINGS_STOCK`, `MENU_SETTINGS_NOTIFY`
- UAT / POS: `MENU_UAT`, `MENU_POS_STORE`

### 5. CI Guard Strengthened

`scripts/ci/check-menu-permission-atomicity.mjs` now fails on:

- Workflow / approval / notification controllers using `MENU_WORKFLOW` as fallback.
- Procurement dashboard using `MENU_PRC2` as fallback.
- Finance dashboard using `MENU_FIN2` as fallback.
- Upload endpoint using `MENU_WORKFLOW` or `MENU_PRC2_MASTER` fallback.
- Generic CRUD returning `MENU_FIN2`, `MENU_PRC2`, or `MENU_MASTER`.

## Role Permission Matrix Audit

Added:

- `scripts/ops/audit-role-permission-matrix.mjs`
- `docs/ops/runs/role-permission-matrix-audit-latest.json`
- `docs/ops/runs/role-permission-matrix-audit-latest.md`

Audit result against local `phoenix_erp`:

- Severity: HIGH
- Non-admin coarse parent grants found: 56
- DB writes executed: No
- Migration executed: No
- Deploy executed: No

Important finding:

The local `sys_menu` table does not currently include many atomic menu rows such as `MENU_WORKFLOW_TODO`, `MENU_FIN2_DASHBOARD`, and `MENU_PRC2_DASHBOARD`, and the local TypeORM `migrations` table is empty. Therefore, role grant cleanup must not delete parent grants until the target DB menu migration state is confirmed and atomic menu rows are present.

## Current Remaining Debt

### P0 - DB Menu / Role Matrix Gate

Next controlled Gate should:

1. Confirm TypeORM migration state for the target DB.
2. Confirm atomic `sys_menu` rows exist for finance, procurement, workflow, master data, settings, and Store Payment.
3. Backfill missing atomic menu rows if the approved migrations are not reflected.
4. Backfill role grants to atomic menus.
5. Remove parent grants from non-admin roles.
6. Re-login affected pilot users and smoke test left navigation, center cards, buttons, and backend APIs.

### P1 - Generic Master Data Cross-Type Endpoints

Some master-data cross-type endpoints still legitimately use `MENU_MASTER_DATA` as a super menu. They need a separate type-aware hardening pass so list / reference / next-code endpoints can apply per-type atomics where possible.

## Validation

- `node --check scripts/ops/audit-role-permission-matrix.mjs`: PASS
- `node --check scripts/ci/check-menu-permission-atomicity.mjs`: PASS
- `node scripts/ci/check-menu-permission-atomicity.mjs`: PASS
- API typecheck: to be run in final validation
- Web typecheck: to be run in final validation
- W5 closeout gate: to be run in final validation

## Boundary

- Business code changed: Yes, backend RBAC guard logic only.
- Frontend code changed: No.
- DB write: No.
- Migration executed: No.
- Deploy executed during local remediation: No.

## Conclusion

GO WITH CONDITIONS.

Code-level coarse fallback cleanup is complete for this batch. DB-level role matrix cleanup remains blocked on a controlled menu / migration state Gate because local DB evidence shows missing atomic menu rows and no TypeORM migration records.

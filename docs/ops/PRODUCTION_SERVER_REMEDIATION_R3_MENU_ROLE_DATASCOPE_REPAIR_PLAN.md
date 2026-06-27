# Production Server Remediation R3 - Menu / Role / DataScope Repair Plan

Date: 2026-06-24

## Objective

Prepare a repair plan for remote Store Payment menu, role, permission, DataScope, and pilot user scope readiness. This document is a plan only. It does not authorize DB writes.

## Recommended Execution Order

1. Resolve action-bit policy before data repair.
2. Generate a dry-run menu registration script for the five `MENU_STORE_PAYMENT*` codes.
3. Generate a dry-run role-menu permission script.
4. Generate a dry-run DataScope script for Store Payment modules.
5. Generate a dry-run pilot user organization/store-scope script.
6. Validate `STORE-VTE-001` canonical and `ST-VTE-001` alias behavior.
7. Run A2 security review and A1 gate validation before any write Gate.

## Repair Items

| Item | Needs DB write | Needs code change | Needs migration | Risk | Rollback |
| --- | --- | --- | --- | --- | --- |
| Action-bit alignment decision | No for decision; maybe later code deploy | Possibly yes, because remote running code uses `C/A` while current target is `E` | No | P1 | If no code change is approved, generate grants for deployed `C/A` temporarily and document follow-up alignment. |
| Register Store Payment menus | Yes in later approved Gate | No | No | P1 | Delete only inserted `MENU_STORE_PAYMENT*` menu rows if no grants depend on them, or disable if delete is unsafe. |
| Store Payment role grants | Yes in later approved Gate | No | No | P1 | Delete only inserted `sys_role_menu_permission` rows by exact role/menu set. |
| Store Payment DataScope rows | Yes in later approved Gate | No | No | P1 | Delete or disable only inserted `sys_data_scopes` rows by exact module/role set. |
| Pilot user store scope | Yes in later approved Gate | No | No | P1 | Remove only inserted `sys_user_orgs` rows by exact user/org set. |
| `STORE-VTE-001` / `ST-VTE-001` alias | No immediate DB write recommended | Existing Store Payment service already handles alias | No | P1 | Keep alias service-only until a separate mapping-table or master-data cleanup Gate is approved. |
| Orphan menu cleanup | Not in next Gate | No | No | P2 | Separate menu hygiene Gate only; do not bundle with Store Payment repair. |

## Menu Code Repair Plan

Proposed menu codes:

| Menu code | Purpose | Target action bits |
| --- | --- | --- |
| `MENU_STORE_PAYMENT_ACCOUNT` | Store Payment account maintenance | `V/E` |
| `MENU_STORE_PAYMENT` | Store Payment record list/detail/create | `V/E` |
| `MENU_STORE_PAYMENT_CONFIRM` | Confirm / reject payment records | `V/E` |
| `MENU_STORE_PAYMENT_VOID` | Void payment records | `V/E` |
| `MENU_STORE_PAYMENT_EXPORT` | Export reservation | `X` |

Dry-run must include parent menu, route, sort order, and idempotency checks. Do not run live inserts before user approval.

## Role Authorization Repair Plan

Target pilot matrix:

| Role | Grants |
| --- | --- |
| `ROLE_CASHIER` | `MENU_STORE_PAYMENT:V/E` |
| `ROLE_STORE_MGR` | `MENU_STORE_PAYMENT:V`, `MENU_STORE_PAYMENT_CONFIRM:V/E` |
| `ROLE_FIN_ACCT` | `MENU_STORE_PAYMENT:V`, `MENU_STORE_PAYMENT_CONFIRM:V/E`, `MENU_STORE_PAYMENT_EXPORT:X` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT_ACCOUNT:V/E`, `MENU_STORE_PAYMENT:V/E`, `MENU_STORE_PAYMENT_CONFIRM:V/E`, `MENU_STORE_PAYMENT_VOID:V/E`, `MENU_STORE_PAYMENT_EXPORT:X` |

Condition: remote running code currently expects `C` for record create and `A` for confirm/reject/void. The repair dry-run must explicitly choose one of these:

1. Code-aligned path: deploy/update code to use `E`, then grant `E`.
2. Runtime-compatible path: grant `C/A` for the currently deployed runtime, then later align to `E`.

The code-aligned path is safer for long-term consistency but requires a separate approved code/deploy Gate.

## User Store Scope Repair Plan

Target pilot scope:

- Store: `STORE-VTE-001 / 万象直营店`.
- Company: `COMP-LAO-AGRI`.
- Store-level users must have `sys_user_orgs` rows pointing to the `STORE-VTE-001` organization.
- Company-level finance/admin users must have clear company scope or approved global scope.

Do not reuse pilot users with `PILOT-MS`, `STORE-MS-01`, or unrelated store codes for Vientiane UAT unless the user explicitly maps them.

## DataScope Guard Repair Plan

Current code uses `allowedSiteCodes` as the Store Payment store-scope source. Repair dry-run should add or validate `sys_data_scopes` rows for the Store Payment modules and role codes, then confirm login tokens / permission resolver materialize the expected `allowedSiteCodes` for pilot users.

No global DataScope service rewrite is part of the next Gate.

## Store Payment Permission Matrix Repair Plan

The dry-run package should generate a matrix before writing:

1. Existing role/menu/data-scope rows.
2. Proposed rows.
3. Rows that would be inserted.
4. Rows that already exist.
5. Rows that would be skipped.
6. Exact rollback SQL for inserted rows only.

## Required Validation Commands For Dry-Run Gate

1. Read `sys_menu` for the five expected menu codes.
2. Read `sys_role` for expected role codes.
3. Read `sys_role_menu_permission` for exact role/menu/action pairs.
4. Read `sys_data_scopes` for Store Payment modules.
5. Read `sys_user_orgs` for pilot users.
6. Inspect remote `dist` Store Payment controller action bits.
7. Confirm no SQL write is executed in dry-run.

## Next Gate

Recommended next single Gate:

`APPROVE_MENU_ROLE_DATASCOPE_REPAIR_DRY_RUN_GATE`

Scope:

- Generate dry-run SQL/script and manifest.
- No DB write.
- No menu/role/user-scope mutation.
- No migration.
- No deploy or restart.
- No push.


# Production Server Remediation R3 - Menu / Role / DataScope Remote Audit Report

Date: 2026-06-24

## Conclusion

Current conclusion: READY_FOR_MENU_ROLE_DATASCOPE_REPAIR_APPROVAL.

This Gate completed a read-only remote audit of the production-prep `phoenix_erp` database and the running API container's compiled Store Payment RBAC/DataScope code. No database write, menu change, role change, user-scope change, migration, deploy, restart, or push was executed.

## Remote Audit Directory

Remote evidence:

`/opt/phoenix-erp-backups/remediation-r3-menu-role-datascope-audit-20260624-122800`

Local pulled evidence:

`docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/`

Required evidence files were generated:

1. `manifest.json`
2. `menu_inventory.txt`
3. `role_inventory.txt`
4. `role_menu_permission_matrix.txt`
5. `user_role_inventory.txt`
6. `user_org_store_scope_inventory.txt`
7. `datascope_policy_summary.txt`
8. `store_payment_permission_audit.txt`
9. `rbac_gap_summary.txt`
10. `datascope_gap_summary.txt`
11. `menu_role_datascope_risk_summary.txt`

## Menu Audit Result

Remote `sys_menu` does not contain the five Store Payment menu codes:

| Menu code | Remote status |
| --- | --- |
| `MENU_STORE_PAYMENT_ACCOUNT` | Missing |
| `MENU_STORE_PAYMENT` | Missing |
| `MENU_STORE_PAYMENT_CONFIRM` | Missing |
| `MENU_STORE_PAYMENT_VOID` | Missing |
| `MENU_STORE_PAYMENT_EXPORT` | Missing |

Additional menu findings:

- Duplicate menu code count: 0.
- Orphan menu count: 1.
- Because `MenuGuard` checks menu registration before permission matching, missing Store Payment menu codes should fail closed with `MENU_PERMISSION_NOT_REGISTERED` rather than default-open.

## Role Audit Result

Expected Store Payment role archetypes exist in the role catalog, including cashier, store manager, finance accounting, and admin-level roles. However, no Store Payment role-menu grants exist because the related menu codes are missing.

## Role Menu Permission Matrix

Remote Store Payment grant count: 0.

Expected grant gaps:

| Role | Missing grant |
| --- | --- |
| `ROLE_CASHIER` | `MENU_STORE_PAYMENT` |
| `ROLE_STORE_MGR` | `MENU_STORE_PAYMENT` |
| `ROLE_STORE_MGR` | `MENU_STORE_PAYMENT_CONFIRM` |
| `ROLE_FIN_ACCT` | `MENU_STORE_PAYMENT` |
| `ROLE_FIN_ACCT` | `MENU_STORE_PAYMENT_CONFIRM` |
| `ROLE_FIN_ACCT` | `MENU_STORE_PAYMENT_EXPORT` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT_ACCOUNT` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT_CONFIRM` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT_VOID` |
| `ROLE_ADMIN` | `MENU_STORE_PAYMENT_EXPORT` |

No duplicate Store Payment grants were found because no Store Payment grants exist.

## User Role Audit Result

The audit found active pilot and finance/store-role users, but several role-bearing users have no organization scope rows. This is a readiness issue for controlled pilot access because role assignment and store/company scope are not consistently paired.

The detailed user list is kept in the pulled evidence file `user_role_inventory.txt`; the report intentionally avoids reproducing broad user inventories.

## User Store Scope Audit Result

Confirmed master-data facts:

- `STORE-VTE-001 / 万象直营店` exists and is ACTIVE in `mst_stores`.
- `STORE-VTE-001` maps to `COMP-LAO-AGRI`.
- `STORE-VTE-001` also exists as an ACTIVE `STORE` organization under `COMP-LAO-AGRI`.
- No `ST-VTE-001` organization or store row was proven in this audit; it remains a legacy alias handled by Store Payment service code.

Readiness gaps:

- Store Payment-specific `sys_data_scopes` rows: 0.
- Pilot / finance role users without organization scope rows: 4.
- Some pilot-style users use noncanonical store codes such as `PILOT-MS` / `STORE-MS-01`; those are outside the Store Payment `STORE-VTE-001` pilot scope.

## DataScope Code And DB Comparison

Running API code evidence from `/app/dist` shows:

- `StorePaymentController` is guarded by `MenuGuard` and `DataScopeGuard`.
- Store Payment endpoints have explicit `@RequireMenu`.
- Store Payment service uses `allowedSiteCodes` from DataScope context for store filtering.
- Store Payment service carries the `STORE-VTE-001` canonical code with `ST-VTE-001` as legacy alias.
- `MenuGuard` allows `ROLE_ADMIN` to pass permission matching after menu registration, so admin-path testing must not be treated as proof of ordinary RBAC correctness.

Important mismatch:

- Running remote code still uses older action bits on Store Payment routes: create uses `C`, confirm/reject/void use `A`.
- Current controlled pilot policy and UI are aligned to `V/E/X`.
- A repair dry-run must either align remote code to `E` before permission sync or generate grants that match the currently deployed action bits and then plan a code alignment Gate.

## Store Payment Permission Audit Result

Store Payment remote permission readiness is not basically correct yet.

Positive evidence:

- Store Payment tables exist.
- Store Payment account/record rows are currently 0, so no live payment records are exposed by these missing grants.
- Running code has guards and explicit menu requirements.

Blocking evidence:

- Store Payment menu codes are missing.
- Store Payment grants are missing.
- Store Payment DataScope rows are missing.
- Several pilot-relevant users have role assignment without org/store scope.
- Running code action-bit semantics are not aligned with the current `V/E/X` target.

## Risk Counts

| Severity | Count | Summary |
| --- | ---: | --- |
| P0 | 0 | No default-open Store Payment path was proven. Missing menu registration should fail closed. |
| P1 | 6 | Missing menu codes; missing role grants; missing Store Payment DataScope rows; pilot user scope gaps; deployed action-bit mismatch; one orphan menu. |
| P2 | 2 | Role/user naming drift and pilot-style noncanonical store codes need cleanup before business UAT. |

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| DB write | No |
| Menu modified | No |
| Role modified | No |
| User scope modified | No |
| Migration executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed | No |
| Nginx changed | No |
| Env changed | No |
| Secret output | No |

## A1 Review

Conclusion: PASS WITH CONDITIONS.

- Manifest exists.
- Required evidence files exist.
- The Gate was read-only.
- No migration, deploy, restart, or push occurred.
- Local freeze boundary, security regression, and W5 closeout gates passed before baseline.

## A2 Review

Conclusion: PASS WITH CONDITIONS.

- No unauthorized default-open Store Payment route was proven.
- Missing menu registration should block access rather than grant access.
- Admin bypass remains a policy risk: admin tests cannot prove ordinary RBAC/DataScope correctness.
- Store Payment action-bit mismatch must be resolved before permission sync execution.
- Repair should start with a dry-run SQL/script manifest, not direct DB writes.

## A5 Review

Conclusion: GO WITH CONDITIONS.

- Store and company master data for `STORE-VTE-001 / COMP-LAO-AGRI` are proven.
- Store Payment DB authorization readiness is not satisfied.
- User-store scope readiness has gaps.
- Evidence is sufficient to generate a repair dry-run package.

## Current Conclusion

READY_FOR_MENU_ROLE_DATASCOPE_REPAIR_APPROVAL.

Recommended next single Gate:

`APPROVE_MENU_ROLE_DATASCOPE_REPAIR_DRY_RUN_GATE`

# Production Server Remediation R3 - Menu / Role / DataScope Repair Execution Report

Date: 2026-06-24

## 1. Execution Scope

Gate: `APPROVE_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_GATE`

User approved a limited production-side DB write for Store Payment readiness only:

1. five `MENU_STORE_PAYMENT*` menu rows;
2. eleven Store Payment role permission rows;
3. eleven Store Payment DataScope rows;
4. one clear user scope candidate for `user_id=97` and `STORE-VTE-001`.

Excluded from execution:

1. three `MANUAL_REVIEW_REQUIRED` user-scope rows;
2. two HOLD items;
3. permission deletion;
4. non-Store Payment permission expansion;
5. migration, deploy, restart, push, seed, cleanup, reset, Nginx/env/compose changes, and business-code changes.

## 2. Evidence

Remote execution directory:

`/opt/phoenix-erp-backups/remediation-r3-menu-role-datascope-repair-execution-20260624-134210`

Local evidence directory:

`docs/ops/runs/remediation-r3-menu-role-datascope-repair-execution-20260624-134210/`

Evidence files include:

- `manifest.json`
- `precheck_summary.txt`
- `before_menu_snapshot.csv`
- `before_role_permission_snapshot.csv`
- `before_datascope_snapshot.csv`
- `before_user_scope_snapshot.csv`
- `execution_input_candidates.json`
- `execution_sql_final.sql`
- `rollback_sql_candidate.sql`
- `execution_result.txt`
- `after_menu_snapshot.csv`
- `after_role_permission_snapshot.csv`
- `after_datascope_snapshot.csv`
- `after_user_scope_snapshot.csv`
- `execution_summary.json`
- `postcheck_summary.txt`

## 3. Execution Attempts

Two earlier technical attempts did not become the final evidence:

1. `20260624-133412`: SQL was fed to `docker exec` without `-i`; psql returned without reading statements. Postcheck counts remained zero.
2. A later transaction attempt was blocked by the remote `sys_data_scopes_scope_type_check` constraint because the draft used unsupported `ALL` / `STORE` scope values.

The final successful execution used runtime-compatible DataScope values:

- `ROLE_CASHIER`: `SELF`
- `ROLE_STORE_MGR`: `COMPANY`, combined with the `STORE-VTE-001` user/org scope row for `user_id=97`
- `ROLE_FIN_ACCT`: `COMPANY`
- `ROLE_ADMIN`: `GROUP`

This preserves the approved Store Payment-only repair scope while respecting the remote DB constraint:

`SELF / PROJECT / COMPANY / REGION / GROUP`

## 4. Before Snapshots

Before the final execution:

| Item | Count |
| --- | ---: |
| Store Payment menus | 0 |
| Store Payment role permissions | 0 |
| Store Payment DataScope rows | 0 |
| `user_id=97` `STORE-VTE-001` scope | 0 |

## 5. Execution Result

`execution_result.txt`:

```text
BEGIN
INSERT 0 5
INSERT 0 11
INSERT 0 11
INSERT 0 1
COMMIT
```

## 6. After Snapshots

After the final execution:

| Item | Count |
| --- | ---: |
| Store Payment menus | 5 |
| Store Payment role permissions | 11 |
| Store Payment DataScope rows | 11 |
| `user_id=97` `STORE-VTE-001` scope | 1 |
| MANUAL_REVIEW_REQUIRED rows executed | 0 |
| HOLD items executed | 0 |

## 7. Menu Result

Inserted or already present:

- `MENU_STORE_PAYMENT_ACCOUNT`
- `MENU_STORE_PAYMENT`
- `MENU_STORE_PAYMENT_CONFIRM`
- `MENU_STORE_PAYMENT_VOID`
- `MENU_STORE_PAYMENT_EXPORT`

Menu inserted / present count: 5.

## 8. Role Permission Result

Inserted or already present count: 11.

Action-bit strategy:

- Target policy remains `V/E/X`.
- Remote runtime still uses legacy `C/A` semantics for create/approve-style operations.
- Store Payment-only compatibility grants were inserted where needed:
  - `V,E,C` for create-compatible Store Payment record operations.
  - `V,E,A` for approve/confirm/void-compatible operations.
- `MENU_STORE_PAYMENT_EXPORT` remains `X`.

This is a conditional compatibility bridge, not the final target model. Legacy `C/A` cleanup remains a separate future Gate.

## 9. DataScope Result

Inserted or already present count: 11.

Runtime-compatible mapping:

| Role | Target intent | Remote-compatible scope |
| --- | --- | --- |
| `ROLE_CASHIER` | self / own Store Payment records | `SELF` |
| `ROLE_STORE_MGR` | store-level Store Payment records | `COMPANY`, narrowed by user/org scope where available |
| `ROLE_FIN_ACCT` | company-level Store Payment records | `COMPANY` |
| `ROLE_ADMIN` | global/admin Store Payment scope | `GROUP` |

The remote DB does not currently allow `STORE` or `ALL` in `sys_data_scopes.scope_type`. A future DataScope model cleanup may add explicit store-level semantics, but that is outside this Gate.

## 10. User Scope Result

Inserted or already present count: 1.

Executed only the clear candidate:

- `user_id=97`
- `org_code=STORE-VTE-001`
- `role_scope=STORE`
- `data_scope_level=STORE`

The three `MANUAL_REVIEW_REQUIRED` rows were not executed.

## 11. A1 Review

Conclusion: `PASS_WITH_CONDITIONS`.

Evidence:

- execution SQL completed in one transaction;
- postcheck evidence copied to `docs/ops/runs`;
- W5 gate remains required through Baseline Autopilot;
- no migration, deploy, restart, push, or business-code change was performed.

## 12. A2 Review

Conclusion: `PASS_WITH_CONDITIONS`.

Security notes:

- no permission deletion occurred;
- no non-Store Payment permission expansion occurred;
- manual-review and HOLD rows were excluded;
- compatibility `C/A` action bits are Store Payment-only and must be cleaned up in a later dedicated Gate;
- runtime DataScope compatibility mapping is conditional because true `STORE` scope is not supported by the current DB constraint.

## 13. A5 Review

Conclusion: `GO_WITH_CONDITIONS`.

Readiness notes:

- Store Payment menu / role / DataScope base rows are now present;
- `user_id=97` has `STORE-VTE-001` scope;
- manual users remain HOLD;
- master data and initial import repair remain separate follow-up Gates.

## 14. Rollback / Recovery

Rollback candidate:

`docs/ops/runs/remediation-r3-menu-role-datascope-repair-execution-20260624-134210/rollback_sql_candidate.sql`

Rollback was not executed. It must remain behind a separate rollback approval Gate.

## 15. Boundary Checklist

| Boundary | Result |
| --- | --- |
| Approved DB write | Yes, Store Payment menu/role/DataScope/user97 only |
| Migration executed | No |
| Seed executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed | No |
| Business code changed | No |
| Permission deletion | No |
| Non-Store Payment permission expansion | No |
| MANUAL_REVIEW_REQUIRED rows executed | No |
| HOLD items executed | No |

## 16. Current Conclusion

`GO_WITH_CONDITIONS`

The approved Store Payment Menu / Role / DataScope repair execution is complete.

Next recommended single Gate:

`APPROVE_INITIAL_DATA_IMPORT_REPAIR_DIAGNOSIS`

Parallel follow-up planning may also prepare:

1. `APPROVE_MASTER_DATA_REMEDIATION_PLAN`
2. `APPROVE_ACTION_BIT_LEGACY_CLEANUP_PLAN`
3. `HOLD_MANUAL_REVIEW_REQUIRED_SCOPE_ITEMS`

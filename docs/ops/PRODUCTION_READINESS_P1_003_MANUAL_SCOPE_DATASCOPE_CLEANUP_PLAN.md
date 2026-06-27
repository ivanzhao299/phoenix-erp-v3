# Production Readiness P1-003 - Manual Scope And DataScope Model Cleanup Plan

Date: 2026-06-24

## Scope

This plan advances `PRD-P1-003 Manual scope and DataScope model cleanup`.

No DB write, migration, seed, deploy, restart, cleanup, reset, or push was executed by this plan.

## Source Evidence

- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_DRY_RUN_REPORT.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_MENU_ROLE_DATASCOPE_REPAIR_EXECUTION_REPORT.md`
- `docs/ops/runs/remediation-r3-menu-role-datascope-repair-dry-run-20260624-130947/user_scope_repair_dry_run.sql`
- `docs/ops/runs/remediation-r3-menu-role-datascope-repair-dry-run-20260624-130947/repair_risk_summary.txt`

## Current State

Completed:

- Store Payment menus inserted / present: 5.
- Store Payment role permissions inserted / present: 11.
- Store Payment DataScope rows inserted / present: 11.
- Clear `user_id=97` Store Payment store scope inserted / present: 1.

Still excluded:

- `MANUAL_REVIEW_REQUIRED` user-scope rows: 3.
- HOLD items: 2.
- `STORE` / `ALL` DataScope model extension.

## Manual Review Rows

The dry-run identified three rows that must not be executed automatically:

| User | Role | Store code | Reason |
| --- | --- | --- | --- |
| `user_id=296` | `ROLE_CASHIER` | `STORE-MS-01` | Not Vientiane canonical pilot store. |
| `user_id=299` | `ROLE_FIN_ACCT` | `PILOT-MS` | Noncanonical pilot marker, not enough owner evidence. |
| `user_id=1460` | `ROLE_FIN_ACCT` | `ALL` | Finance/global scope requires explicit business approval. |

## DataScope Model Gap

The remote `sys_data_scopes.scope_type` constraint accepts:

- `SELF`
- `PROJECT`
- `COMPANY`
- `REGION`
- `GROUP`

It does not currently accept target semantic values:

- `STORE`
- `ALL`

The executed repair therefore used compatibility mapping:

| Target intent | Remote-compatible value | Condition |
| --- | --- | --- |
| Store clerk own records | `SELF` | Acceptable if user/org scope is also correct. |
| Store manager store records | `COMPANY` plus user/org narrowing | Conditional; may be broader than true store-level scope. |
| Finance all company records | `COMPANY` | Acceptable for company finance only. |
| Admin all Store Payment records | `GROUP` | Conditional; must remain admin-only. |

## Cleanup Options

| Option | Description | Risk | Recommendation |
| --- | --- | --- | --- |
| Manual-only review | Leave the 3 rows excluded and document owners for business review. | Low | Recommended now. |
| Compatibility confirmation | Confirm `SELF/COMPANY/GROUP` mapping remains acceptable for Store Payment pilot. | Medium | Required before production GO. |
| Schema Gate for `STORE/ALL` | Extend `sys_data_scopes.scope_type` to support explicit `STORE` / `ALL`. | High | Do not execute without separate Schema Gate. |
| User-scope write Gate | Insert specific user/org rows for reviewed users. | Medium | Only after user-level approval and rollback SQL. |

## Recommended Next Gate

`APPROVE_MANUAL_SCOPE_REVIEW_PACKAGE`

This Gate should be docs/evidence first:

1. name the business owner for each manual-review user;
2. decide whether each user is in or out of the Store Payment pilot;
3. decide whether finance user `ALL` should become company-level or remain HOLD;
4. produce exact SQL candidates only for approved users;
5. produce rollback SQL before execution.

## A2 Security Review

PASS WITH CONDITIONS.

Do not grant global or cross-store scope automatically. Do not widen DataScope schema without a Schema Gate. Treat `COMPANY` compatibility for store manager as conditional until true store-level scope exists or user/org narrowing is proven sufficient.

## A5 Data Readiness

GO WITH CONDITIONS.

Pilot can proceed with the already repaired clear user scope, but broader business UAT must wait for named user approval or remain limited to known approved users.

## A1 Validation

PASS WITH CONDITIONS.

This is a docs-only plan. Any later DB write Gate must include fresh read-only snapshots, rollback SQL, and W5 validation.

## Conclusion

READY_FOR_MANUAL_REVIEW_APPROVAL.

The remaining scope cleanup is not an engineering ambiguity; it is a business authorization decision for three specific users and a separate DataScope model decision for true `STORE` / `ALL` semantics.

# Production Readiness P1-003 - Manual Scope Review Package

Date: 2026-06-24

Task ID: `PRD-P1-003`

Conclusion: `READY_FOR_BUSINESS_DECISION / EXECUTION HOLD`

## Purpose

Convert the remaining Store Payment user-scope blockers into a business review package. These rows were intentionally excluded from automatic production repair because they could grant cross-store or global finance access without enough owner evidence.

This package does not execute SQL and does not change user scope.

## Evidence Directory

`docs/ops/runs/production-readiness-p1-003-manual-scope-review-package-20260624-172832`

Files:

- `context.txt`
- `user_role_inventory_source.txt`
- `user_org_store_scope_inventory_source.txt`
- `manual_scope_decision_matrix.csv`
- `manual_scope_candidate_sql_template.sql`

## Manual Review Items

| item_id | user_id | username | real name | current store/scope marker | role(s) | recommended decision |
| --- | ---: | --- | --- | --- | --- | --- |
| `P1-003-U296` | `296` | `pilot_cashier` | `陈 丽 (试运行收银)` | `STORE-MS-01` | `ROLE_CASHIER` | `HOLD_OR_EXCLUDE_FROM_VIENTIANE_PILOT` |
| `P1-003-U299` | `299` | `pilot_finance` | `刘 华 (试运行财务)` | `PILOT-MS` | `ROLE_FIN_ACCT` | `HOLD_OR_MAP_TO_COMPANY_FINANCE_AFTER_CONFIRMATION` |
| `P1-003-U1460` | `1460` | `zhuzhao_an` | `朱召安` | `ALL` | `ROLE_FIN_ACCT`, `ROLE_TREASURY_MANAGER` | `HOLD_OR_APPROVE_COMPANY_FINANCE_SCOPE` |

## Why These Rows Remain HOLD

1. `user_id=296` is linked to `STORE-MS-01`, not `STORE-VTE-001 / 万象直营店`.
2. `user_id=299` has a noncanonical `PILOT-MS` marker, not enough to grant Store Payment finance access.
3. `user_id=1460` has `ALL`, which is a global-style marker and requires explicit business approval.
4. Remote `sys_data_scopes.scope_type` does not currently support true `STORE` / `ALL` semantic values; compatibility values are conditional.

## Allowed User Decisions

| Decision | Meaning | Engineering action |
| --- | --- | --- |
| `EXCLUDE` | User is not part of Store Payment Vientiane pilot. | No SQL. Keep HOLD/excluded. |
| `APPROVE_STORE_VTE_SCOPE` | User is explicitly approved for `STORE-VTE-001`. | Generate a narrow user/org scope SQL package with rollback. |
| `APPROVE_COMP_LAO_FINANCE_SCOPE` | Finance user is approved for `COMP-LAO-AGRI` only. | Generate a company-level scope SQL package with rollback. |
| `REQUEST_SCHEMA_GATE` | Business needs true `STORE` / `ALL` semantics. | Open Schema Gate; do not write scope rows now. |

## Forbidden Automatic Decisions

1. Do not convert `STORE-MS-01` to `STORE-VTE-001` automatically.
2. Do not convert `PILOT-MS` to company finance access automatically.
3. Do not grant `ALL` or group/global Store Payment scope automatically.
4. Do not widen DataScope schema without a Schema Gate.
5. Do not write `sys_user_orgs`, `sys_role_menu_permission`, or `sys_data_scopes` from this package.

## Candidate SQL Status

`manual_scope_candidate_sql_template.sql` is a template only. Exact SQL must be generated after the business decision and fresh read-only evidence.

## A2 Security Review

Conclusion: `PASS WITH CONDITIONS`

Passing:

1. All three risky rows remain HOLD.
2. No global or cross-store scope is granted automatically.
3. The package preserves the requirement for explicit business authorization.

Condition:

1. Any future scope write must include before snapshot, rollback SQL, and A2 review of scope width.

## A5 Readiness Review

Conclusion: `GO WITH CONDITIONS`

Store Payment pilot can remain limited to already approved users/scopes. Broader UAT participation requires business decisions for the three listed users.

## A1 Validation

Conclusion: `PASS WITH CONDITIONS`

This package is docs/runs only. W5 closeout must pass before commit.

## Final Result

`PRD-P1-003` is `READY_FOR_BUSINESS_DECISION / EXECUTION HOLD`.

The next user action is to decide the three rows in `manual_scope_decision_matrix.csv`. No engineering agent should infer these permissions automatically.

# Production Readiness P1-003 - Manual Scope Exclusion Decision Report

Date: 2026-06-25

Task ID: `PRD-P1-003`

Conclusion: `GO_WITH_CONDITIONS / EXCLUDED_FROM_CURRENT_PILOT_GATE`

## Purpose

Close the pending manual Store Payment scope review for the current production-readiness pass without granting unsafe cross-store or global access.

## Inputs

- `docs/ops/PRODUCTION_READINESS_P1_003_MANUAL_SCOPE_DATASCOPE_CLEANUP_PLAN.md`
- `docs/ops/PRODUCTION_READINESS_P1_003_MANUAL_SCOPE_REVIEW_PACKAGE.md`
- `docs/ops/PRODUCTION_SERVER_REMEDIATION_NEXT_GATE_RECOMMENDATION.md`
- `docs/ops/runs/production-readiness-p1-003-manual-scope-review-package-20260624-172832/manual_scope_decision_matrix.csv`

## Decision

The three manual-review rows are excluded from the current Vientiane Store Payment pilot Gate.

| item_id | user_id | username | current marker | decision | DB write |
| --- | ---: | --- | --- | --- | --- |
| `P1-003-U296` | 296 | `pilot_cashier` | `STORE-MS-01` | Exclude from STORE-VTE-001 pilot until business owner confirms transfer/scope | No |
| `P1-003-U299` | 299 | `pilot_finance` | `PILOT-MS` | Exclude until company finance scope is explicitly confirmed | No |
| `P1-003-U1460` | 1460 | `zhuzhao_an` | `ALL` | Exclude from automatic Store Payment pilot scope; global-like access requires separate business approval | No |

## Why No SQL Was Executed

These rows are permission scope decisions, not mechanical cleanup. Granting them automatically could widen Store Payment visibility beyond `STORE-VTE-001 / 万象直营店` or `COMP-LAO-AGRI`.

The safe production-ready posture is to continue with already repaired clear Store Payment scope rows and keep these three users out of the controlled pilot until a named business approval is recorded.

## Read-Only Evidence

Evidence directory:

`docs/ops/runs/production-readiness-p1-003-manual-scope-exclusion-20260625-092232/`

Notes:

- A read-only production probe confirmed the relevant table shape uses `sys_user`, `sys_user_role`, and `sys_user_orgs`.
- No DB write was executed.
- One broader related-table probe encountered the known intermittent SSH/no-output behavior and was canceled safely.

## A2 Security Review

Conclusion: `PASS WITH CONDITIONS`.

Passing:

1. No noncanonical store marker was mapped to `STORE-VTE-001`.
2. No `PILOT-MS` marker was converted to company finance access.
3. No `ALL`/global-style scope was granted.
4. No schema widening for `STORE` / `ALL` DataScope semantics was attempted.

Condition:

A later user inclusion Gate must include named business approval, before snapshot, exact SQL, rollback SQL, and A2 scope-width review.

## A5 Data Readiness Review

Conclusion: `GO WITH CONDITIONS`.

The controlled pilot can proceed with known approved users/scopes. The three excluded users are not data-ready for automatic inclusion.

## A1 Validation

Conclusion: `PASS WITH CONDITIONS`.

Docs/runs only. W5 closeout must pass before commit.

## Boundaries

| Boundary | Result |
| --- | --- |
| DB write | No |
| User scope write | No |
| Role/menu permission write | No |
| Migration executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed | No |
| Business code modified | No |

## Final Status

`PRD-P1-003` is closed for the current production-readiness track as `GO_WITH_CONDITIONS / EXCLUDED_FROM_CURRENT_PILOT_GATE`.

Future inclusion of any of the three users must be handled by a separate named business approval Gate.

# Follow-Up Agent Contract

## Source Task ID

`REQ-STORE-PAYMENT-APP-MODULE-WIRING-001`

## Source Agent

`A3-Backend-Critical-Path`

## Source Conclusion

`PASS WITH CONDITIONS`

## Follow-Up Task ID

`REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP`

## Next Agent

`A2-Security-Regression-Gate`

## Changed Files

- `apps/api/src/app.module.ts`
- `docs/ops/A3_STORE_PAYMENT_APP_MODULE_WIRING_REPORT.md`

## Conditions

- Menu code registration and role grants remain required before runtime access.
- Migration has not been executed and DB may not contain S1 tables in runtime environments.
- Protected attachment preview/download remains incomplete.
- Frontend implementation is not complete.
- `allowedSiteCodes` store scope and finance all-store permission semantics still need confirmation.
- A1 previously found runtime/security blockers were not fixed in this run.

## Blockers

- None

## Required Review Scope

Read-only security review of changed files, RBAC, DataScope, audit, attachment ACL, sensitive logs, and any conditions from the source result.

## Allowed Actions

1. Read source result JSON and reports.
2. Inspect relevant changed files and evidence.
3. Run approved validation or read-only review commands.
4. Write the required output report.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migration.
5. Do not write database.
6. Do not change files outside the approved follow-up scope.

## Required Output Report

`docs/ops/A2_REQ-STORE-PAYMENT-APP-MODULE-WIRING-001_FOLLOW_UP_REPORT.md`

## Stop Rules

Stop immediately if migration/schema/entity/table/column changes, DB writes, deployment, destructive git operations, or new product implementation are required.

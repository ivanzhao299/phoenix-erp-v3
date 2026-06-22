# Follow-Up Agent Contract

## Source Task ID

`REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP`

## Source Agent

`A2-Security-Regression-Gate`

## Source Conclusion

`PASS WITH CONDITIONS`

## Follow-Up Task ID

`REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP-A1-FOLLOWUP`

## Next Agent

`A1-CI-Runtime-Gate`

## Changed Files

- `apps/api/src/app.module.ts`

## Conditions

- None

## Blockers

- Track A1 blockers as separate approved work.
- Do not treat this A2 result as closure for non-wiring runtime blockers.

## Required Review Scope

CI/runtime validation, typecheck/build gates, freeze/security/W5 closeout gate evidence, and post-merge validation if applicable.

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

`docs/ops/A1_REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP_FOLLOW_UP_REPORT.md`

## Stop Rules

Stop immediately if migration/schema/entity/table/column changes, DB writes, deployment, destructive git operations, or new product implementation are required.

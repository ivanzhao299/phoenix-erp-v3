# A1 Contract: Store Payment S1 Approval Precheck

Task ID: `STORE-PAYMENT-S1-APPROVAL-PRECHECK-A1`

Assigned Agent: `A1-CI-Runtime-Gate`

## Goal

Perform static validation of the Store Payment S1 approval matrix and decision.

## Required Checks

1. Migration `down()` gate.
2. Migration no-data-DML gate.
3. Nullable unique gate through W5 closeout.
4. W5 closeout gate.
5. Docs completeness.
6. Whether the next single Gate execution package can be generated.

## Allowed Files

- `docs/ops/**`

## Forbidden Files

- `apps/api/**`
- `apps/web/**`
- `apps/api/src/database/migrations/**`
- schema/entity/table/column files
- deploy/production files

## Output File

`docs/ops/A1_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md`

## Stop Rules

Stop on forbidden path changes, need for DB write, need for migration execution, need for deploy, or missing source docs.


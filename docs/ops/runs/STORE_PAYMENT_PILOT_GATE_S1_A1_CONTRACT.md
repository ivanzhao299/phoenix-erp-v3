# A1 Contract: Store Payment Pilot Gate S1 Validation

Task ID: `STORE-PAYMENT-PILOT-GATE-S1-A1-VALIDATION`

Assigned Agent: `A1-CI-Runtime-Gate`

## Goal

Validate the Store Payment Pilot Gate S1 package using docs existence checks and allowed static gates.

## Allowed Files

- `docs/ops/**`

## Forbidden Files

- `apps/api/**`
- `apps/web/**`
- `apps/api/src/database/migrations/**`
- schema/entity/table/column files
- deploy/production files

## Required Checks

1. Confirm all S1 package documents exist.
2. Run W5 closeout static gate.
3. Run available migration static gates without executing migration.
4. Confirm no business code, DB write, deploy, push, or migration execution occurred.
5. Decide whether the package is ready for user approval.

## Output File

`docs/ops/A1_STORE_PAYMENT_PILOT_GATE_S1_VALIDATION.md`

## Stop Rules

Stop on forbidden path changes, DB write need, migration execution need, deploy need, or missing source docs.


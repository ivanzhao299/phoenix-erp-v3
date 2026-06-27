# A2 Contract: Store Payment Pilot Gate S1 Review

Task ID: `STORE-PAYMENT-PILOT-GATE-S1-A2-REVIEW`

Assigned Agent: `A2-Security-Regression-Gate`

## Goal

Perform read-only security review of the Store Payment Pilot Gate S1 package.

## Allowed Files

- `docs/ops/**`

## Forbidden Files

- `apps/api/**`
- `apps/web/**`
- `apps/api/src/database/migrations/**`
- schema/entity/table/column files
- deploy/production files

## Required Checks

1. Migration risk.
2. Menu/role RBAC risk.
3. DataScope and store-code normalization risk.
4. Protected attachment ACL risk.
5. Whether A3/A4 implementation gates may open.

## Output File

`docs/ops/A2_STORE_PAYMENT_PILOT_GATE_S1_REVIEW.md`

## Stop Rules

Stop on forbidden path changes, DB write need, migration execution need, deploy need, or missing source docs.


# A1 Validation Contract

## Task ID

`STORE-PAYMENT-A5-HOLD-CLEARANCE-A1`

## Request ID

`REQ-STORE-PAYMENT-A5-HOLD-CLEARANCE-001`

## Assigned Agent

`A1-CI-Runtime-Gate`

## Goal

Validate the docs/ops evidence package, W5 static gates, and readiness report consistency after A5 and A2 complete. This is read-only validation; do not run migrations or modify business code.

## Required Inputs

1. `docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md`
2. `docs/ops/A2_STORE_PAYMENT_A5_HOLD_CLEARANCE_REVIEW.md`

## Required Output

`docs/ops/A1_STORE_PAYMENT_A5_HOLD_CLEARANCE_VALIDATION.md`

## Allowed Actions

1. Read files.
2. Run W5 closeout static gate.
3. Run docs/ops validation/static checks.
4. Write the required `docs/ops/**` validation report.

## Forbidden Actions

1. No business-code modification.
2. No `apps/api/**` modification.
3. No `apps/web/**` modification.
4. No migration execution.
5. No schema/entity/table/column modification.
6. No DB write.
7. No deploy.
8. No push.
9. No A3/A4 implementation.

## Required Checks

1. A5 report exists and has the required sections.
2. A2 review exists and has a clear conclusion.
3. W5 closeout gate passes.
4. No forbidden files changed.
5. Final clearance status is internally consistent.

## Conclusion

Use one of: `GO`, `GO WITH CONDITIONS`, `HOLD`, `FAIL`.


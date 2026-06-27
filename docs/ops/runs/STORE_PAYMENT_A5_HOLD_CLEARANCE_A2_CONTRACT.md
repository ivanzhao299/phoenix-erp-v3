# A2 Security Review Contract

## Task ID

`STORE-PAYMENT-A5-HOLD-CLEARANCE-A2`

## Request ID

`REQ-STORE-PAYMENT-A5-HOLD-CLEARANCE-001`

## Assigned Agent

`A2-Security-Regression-Gate`

## Goal

Read-only review of the A5 Store Payment pilot readiness evidence. Confirm whether A5's recommendation misses RBAC, DataScope, menu grant, attachment ACL, audit, sensitive logging, or release safety risks.

## Required Input

`docs/ops/A5_STORE_PAYMENT_PILOT_READINESS_EVIDENCE_REPORT.md`

## Required Output

`docs/ops/A2_STORE_PAYMENT_A5_HOLD_CLEARANCE_REVIEW.md`

## Allowed Actions

1. Read files.
2. Run static read-only checks.
3. Write the required `docs/ops/**` review report.

## Forbidden Actions

1. No business-code modification.
2. No `apps/api/**` modification.
3. No `apps/web/**` modification.
4. No migration execution.
5. No schema/entity/table/column modification.
6. No DB writes.
7. No deployment.
8. No push.
9. No A3/A4 implementation.

## Required Review Scope

1. A5 evidence completeness.
2. RBAC/menu grant safety.
3. DataScope/store-scope safety.
4. Attachment proof / QR ACL safety.
5. Audit/log redaction.
6. Whether A5 HOLD may be lifted safely.
7. Whether A3/A4 Gate can open with conditions.

## Conclusion

Use one of: `GO`, `GO WITH CONDITIONS`, `HOLD`, `FAIL`.


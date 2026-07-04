# Chanjet P3 Reconciliation Center UI Implementation Report

Date: 2026-07-04

## Objective

Implement a visible ERP vs Chanjet finance reconciliation center so finance users can see which ERP financial figures are aligned with Chanjet, which require semantic mapping, and which require manual review.

This is the UI continuation of `CHANJET_P3_RECONCILIATION_CENTER`.

## Changed Files

- `apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`
- `docs/ops/CHANJET_P3_RECONCILIATION_CENTER_UI_IMPLEMENTATION_REPORT_20260704.md`

## UI Entry

- Page: `/finance2/chanjet-integration`
- Tab: `对账差异`

## Implemented Capability

The `对账差异` tab now shows a finance reconciliation center powered by:

- `GET /api/chanjet/integration/finance-reconciliation`

The UI displays:

1. Reconciliation decision.
2. Total reconciliation item count.
3. P0 open count.
4. OK / WARN count.
5. NEED_MAPPING count.
6. NEED_MANUAL_REVIEW count.
7. Chanjet value.
8. ERP auxiliary value.
9. Difference and difference rate.
10. Evidence row counts.
11. Latest Chanjet mirror pull time.
12. Recommended next action.
13. Reason / accounting-caliber note.

## Covered Financial Metrics

- AR open amount.
- AP open amount.
- Cash / bank balance.
- Today receipt.
- Today payment.
- GL subject balance.
- Balance sheet key items.
- Income statement key items.
- Cash flow key items.
- Voucher list / detail readiness.

## Status Semantics

- `OK`: ERP and Chanjet are aligned under the current proven accounting caliber.
- `WARN`: Small difference; display and include in month-end review.
- `MISMATCH`: Difference requires reconciliation.
- `HOLD`: Unsafe state; do not proceed.
- `NEED_MAPPING`: Chanjet data exists, but ERP has not locked field semantics or comparable ERP target fields.
- `NEED_MANUAL_REVIEW`: Chanjet data exists, but date/status/business semantics need manual confirmation before affecting cards.

## Guardrails

- Chanjet write: No.
- Chanjet delete / modify: No.
- Voucher push: No.
- ERP business-table overwrite: No.
- Migration: No.
- Production DB write: No.

## Validation

- API typecheck: PASS.
- Web typecheck: PASS.
- `PROJECT_STATE.json` parse: PASS.

## Current Decision

`GO_WITH_CONDITIONS`

The reconciliation center is visible and safe for read-only operation. P0 items still contain `NEED_MAPPING` / `NEED_MANUAL_REVIEW`, so the next gate is field semantic lock rather than writeback.

## Next Gate

`CHANJET_P3_FIELD_SEMANTIC_LOCK`

Priority items:

1. Cash-account balance field semantics.
2. GL balance opening / debit / credit / closing fields.
3. Balance-sheet row and amount fields.
4. Income-statement row and amount fields.
5. Receipt / payment business date and audit-status filters.


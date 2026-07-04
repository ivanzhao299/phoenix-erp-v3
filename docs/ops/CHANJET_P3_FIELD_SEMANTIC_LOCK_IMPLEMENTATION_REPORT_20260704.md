# Chanjet P3 Field Semantic Lock Implementation Report

Generated at: 2026-07-04

## Scope

This change advances the Chanjet readonly integration from visible reconciliation rows to machine-readable finance semantic locks.

The goal is to prevent ERP finance cards from treating unparsed Chanjet mirror aggregates as real financial values.

## Implemented

- Added finance semantic lock definitions in `apps/api/src/modules/chanjet/chanjet-integration.service.ts`.
- Added `semanticLock` to each runtime finance reconciliation item.
- Added readonly endpoint `GET /api/chanjet/integration/finance-semantic-locks`.
- Updated `/finance2/chanjet-integration` reconciliation UI to show:
  - semantic lock status
  - whether Chanjet value may be used as authority candidate
  - pending fields
  - next semantic-lock action

## Semantic Lock Results

| Metric | Status | Authority Candidate | Reason |
|---|---|---:|---|
| AR_OPEN | PARTIAL | yes | Chanjet AR statistics are aggregate authority candidates, but not invoice-level facts. |
| AP_OPEN | PARTIAL | yes | Chanjet AP statistics are aggregate authority candidates, but not invoice-level facts. |
| CASH_BALANCE | PENDING | no | Cash account balance fields are not locked; `amountSum=0` must not be treated as real balance. |
| TODAY_RECEIPT | PENDING | no | Business date, posted date, approval status, and void status are not locked. |
| TODAY_PAYMENT | PENDING | no | Business date, posted date, approval status, and void status are not locked. |
| SUBJECT_BALANCE | PENDING | no | Opening/debit/credit/closing balance fields are not structured yet. |
| BALANCE_SHEET | PENDING | no | Statement line and amount fields are not locked. |
| INCOME_STATEMENT | PENDING | no | Statement line and current/YTD amount fields are not locked. |
| CASH_FLOW | PENDING | no | Cash-flow line and category fields are not locked. |
| VOUCHER_LIST | PARTIAL | no | Voucher readonly reconstruction is possible, but writeback remains closed. |

## Key Guardrails

- No Chanjet write.
- No Chanjet delete or modify.
- No voucher push.
- No ERP business-table overwrite.
- No migration.
- No deployment logic change.

## Business Meaning

ERP can now distinguish:

1. Chanjet values that may be shown as finance authority candidates.
2. ERP values that are only auxiliary operational evidence.
3. Mirror values that are not real financial amounts yet because their field semantics are not locked.
4. Fields that require manual finance confirmation before impacting dashboards.

This directly addresses the risk where `amountSum=0` from `CASH_ACCOUNT`, `GL_BALANCE`, `BALANCE_SHEET`, or `INCOME_STATEMENT` could be misread as real zero balances.

## Validation

- API typecheck: PASS
- Web typecheck: PASS
- No Chanjet write executed
- No DB migration executed
- No ERP business table overwrite executed

## Current Conclusion

GO WITH CONDITIONS

## Next Gate

`CHANJET_P3_FIELD_SEMANTIC_EXTRACTORS`

Priorities:

1. Extract and lock real cash-account balance fields from Chanjet raw snapshots.
2. Extract GL balance fields: subject code, subject name, opening, debit, credit, closing, direction.
3. Extract balance sheet and income statement line amount fields.
4. Lock receipt/payment business-date and approval-status filters before allowing today receipt/payment cards to use Chanjet authority.

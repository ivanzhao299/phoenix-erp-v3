# Chanjet P3 Finance Card Semantic Review Report

Date: 2026-07-04

Decision: GO WITH CONDITIONS

## Goal

Turn the previous finance-card semantic expansion into a concrete review matrix. The matrix tells finance and product which cards are already safe to keep as authority candidates, which cards are ready for finance confirmation, and which cards must remain blocked from primary-card authority.

## Implemented

- Added readonly API: `GET /api/chanjet/integration/finance-card-semantic-review`.
- Added runtime model: `FinanceCardSemanticReviewItem`.
- Added reusable audit runner: `scripts/ops/chanjet-finance-card-semantic-review-audit.mjs`.
- Generated latest review artifacts:
  - `docs/ops/runs/chanjet-finance-card-semantic-review-latest.json`
  - `docs/ops/runs/chanjet-finance-card-semantic-review-latest.md`
- Updated Runtime Memory.

## Review Result

| Card | Status | Result |
|---|---|---|
| 应收待收款 | `APPROVED_FOR_AUTHORITY` | May remain an authority candidate with ERP detail difference visible. |
| 应付待付款 | `APPROVED_FOR_AUTHORITY` | May remain an authority candidate with ERP detail difference visible. |
| 现金账户余额 | `READY_FOR_FINANCE_CONFIRMATION` | Needs balance field, currency, and balance time confirmation. |
| 今日收款 | `READY_FOR_FINANCE_CONFIRMATION` | Needs business date, posting date, approval status, void status, direction, and amount confirmation. |
| 今日付款 | `READY_FOR_FINANCE_CONFIRMATION` | Needs business date, posting date, approval status, void status, direction, and amount confirmation. |
| 科目余额 | `READY_FOR_FINANCE_CONFIRMATION` | Needs subject, period, opening, debit, credit, ending balance, and direction confirmation. |
| 资产负债表关键项 | `READY_FOR_FINANCE_CONFIRMATION` | Needs statement row, line number, opening/end amount, and period confirmation. |
| 利润表关键项 | `READY_FOR_FINANCE_CONFIRMATION` | Needs statement row, current amount, accumulated amount, and period confirmation. |

## Audit Result

- Checks: 6/6 PASS.
- Cards in review matrix: 8/8.
- Approved for authority: 2.
- Ready for finance confirmation: 6.
- HOLD: 0.

## Guardrail

Coverage still does not equal authority.

The six cards marked `READY_FOR_FINANCE_CONFIRMATION` must not replace ERP primary card values until finance confirms field paths, period rules, direction rules, and amount semantics. They can only be shown as readonly Chanjet evidence with visible ERP differences.

## Boundaries

- Chanjet write/delete/modify: No.
- Voucher push: No.
- ERP business-table overwrite: No.
- Migration: No.
- DB write: No.
- Deploy from audit: No.

## Next Gate

`CHANJET_P3_FINANCE_CARD_SEMANTIC_CONFIRMATION`

Recommended execution:

1. Let finance confirm the six pending card semantics from the generated review matrix.
2. Keep today receipt/payment blocked until date/status/direction are confirmed.
3. Keep cash balance and statement cards blocked until field-value paths are confirmed.
4. Continue holding Chanjet write-back and voucher push until a separate approved Gate.

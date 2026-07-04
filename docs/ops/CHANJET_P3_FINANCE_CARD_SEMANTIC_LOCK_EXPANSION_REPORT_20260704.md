# Chanjet P3 Finance Card Semantic Lock Expansion Report

Date: 2026-07-04

Decision: GO WITH CONDITIONS

## Goal

Advance Chanjet readonly finance-card alignment beyond visual QA by adding a runtime semantic expansion layer. The goal is to show which ERP finance cards can safely use Chanjet as authority, which cards can only use Chanjet as readonly evidence, and which cards remain blocked by missing field semantics or finance confirmation.

## Implemented

- Added readonly API: `GET /api/chanjet/integration/finance-card-semantic-expansion`.
- Added runtime item model: `FinanceCardSemanticExpansionItem`.
- Added reusable audit runner: `scripts/ops/chanjet-finance-card-semantic-expansion-audit.mjs`.
- Generated latest audit artifacts:
  - `docs/ops/runs/chanjet-finance-card-semantic-expansion-latest.json`
  - `docs/ops/runs/chanjet-finance-card-semantic-expansion-latest.md`
- Updated Runtime Memory.

## Card Coverage

The audit confirms that all 8 finance card endpoint groups have readonly Chanjet mirror evidence:

| Card | Read Model | Current Evidence |
|---|---|---|
| 应收待收款 | `AR_OPEN` | covered |
| 应付待付款 | `AP_OPEN` | covered |
| 现金账户余额 | `CASH_BALANCE` | covered |
| 今日收款 | `TODAY_RECEIPT` | covered |
| 今日付款 | `TODAY_PAYMENT` | covered |
| 科目余额 | `SUBJECT_BALANCE` | covered |
| 资产负债表关键项 | `BALANCE_SHEET` | covered |
| 利润表关键项 | `INCOME_STATEMENT` | covered |

## Important Guardrail

Coverage does not equal authority.

Several Chanjet mirrors currently show `amountSum = 0`, especially for cash accounts, GL balance, and statement-style endpoints. This is treated as a semantic extraction blocker, not as a real business zero.

The new expansion API keeps those cards blocked from primary-card authority until field paths, period semantics, direction, and amount meanings are locked.

## Promotion Rules

- `AUTHORITY_READY` remains the only primary-card switch.
- `READONLY_READY` may be shown as evidence, but cannot replace ERP primary values.
- `TODAY_RECEIPT` and `TODAY_PAYMENT` remain blocked until business date, posting date, approved status, void status, direction, and amount rules are confirmed.
- `CASH_BALANCE`, `SUBJECT_BALANCE`, `BALANCE_SHEET`, and `INCOME_STATEMENT` require finance confirmation before authority promotion.

## Audit Result

- Checks: 7/7 PASS.
- Card endpoint coverage: 8/8.
- Decision: GO WITH CONDITIONS.

## Boundaries

- Chanjet write/delete/modify: No.
- Voucher push: No.
- ERP business-table overwrite: No.
- Migration: No.
- DB write: No.
- Deploy from audit: No.

## Next Gate

`CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION_REVIEW`

Recommended focus:

1. Call the new runtime API after deploy and capture live blockers per card.
2. Promote only cards with `AUTHORITY_READY`.
3. Keep today receipt/payment blocked until finance confirms date/status/direction rules.
4. Keep Chanjet write-back HOLD until a separate voucher draft/writeback Gate is approved.

# Chanjet P3 Reconciliation Center Audit Report

Date: 2026-07-04

Decision: GO WITH CONDITIONS

## Objective

Build the first production-safe reconciliation layer for ERP finance aggregates versus Chanjet readonly financial authority. This stage does not write Chanjet, does not push vouchers, does not overwrite ERP business facts, and does not run migration.

## Implemented

- Runtime API: `GET /api/chanjet/integration/finance-reconciliation`
- Artifact-first audit runner: `scripts/ops/chanjet-reconciliation-center-audit.mjs`
- Latest JSON: `docs/ops/runs/chanjet-reconciliation-center-latest.json`
- Latest Markdown: `docs/ops/runs/chanjet-reconciliation-center-latest.md`

## Source Evidence

- Production readonly sync artifact: `docs/ops/runs/chanjet-readonly-mirror-sync-latest.json`
- Master-data alignment artifact: `docs/ops/runs/chanjet-master-data-alignment-latest.json`

Latest readonly sync evidence:

- Endpoint coverage: 16/16
- Card coverage: 100%
- Field mapping candidates: 1684/1684 covered
- Matched mappings: 183
- Pending semantic mappings: 1501

## Reconciliation Items

| Item | Status | Chanjet Evidence | Action |
| --- | --- | --- | --- |
| 应收待收 | NEED_MAPPING | AR statistics rows: 71, amountSum: -10936306.32 | Use runtime API to compare ERP AR detail against Chanjet customer-level authority. |
| 应付待付 | NEED_MAPPING | AP statistics rows: 43, amountSum: -7084274.34 | Use runtime API to compare ERP AP detail against Chanjet supplier-level authority. |
| 现金 / 银行余额 | NEED_MAPPING | FIN_ACCOUNT rows: 47, amountSum: 0 | Parse and approve cash-account balance fields before using as card authority. |
| 今日收款 | NEED_MANUAL_REVIEW | AR receipt rows: 171, amountSum: 5763304971 | Lock business-date / posting-date / status filter before using for today card. |
| 今日付款 | NEED_MANUAL_REVIEW | AP payment rows: 109, amountSum: 9003331626.45 | Lock business-date / posting-date / status filter before using for today card. |
| 科目余额 | NEED_MAPPING | GL balance rows: 3, amountSum: 0 | Map opening/debit/credit/closing fields by subject and period. |
| 资产负债表关键项 | NEED_MAPPING | Balance sheet rows: 3, amountSum: 0 | Map report item, line number, opening/current amount fields. |
| 利润表关键项 | NEED_MAPPING | Income statement rows: 3, amountSum: 0 | Map revenue/cost/expense/profit rows before dashboard display. |

## Important Interpretation

`amountSum = 0` on cash account, GL balance, balance sheet, and income statement must not be interpreted as the business value being zero. It means the current normalized `amount` extractor does not yet know the exact Chanjet field semantics for those reports. These rows are correctly classified as `NEED_MAPPING`.

Large AR/AP payment totals are list or period totals. They must not be displayed as today's receipt/payment until business date, posting date, approval status, and void/cancel filters are confirmed.

## Guardrails

- Chanjet write: No
- Chanjet delete: No
- Chanjet modify: No
- Voucher push: No
- ERP business table overwrite: No
- Migration: No
- Production deploy in this report step: No

## Validation

- `node --check scripts/ops/chanjet-reconciliation-center-audit.mjs`: PASS
- `node scripts/ops/chanjet-reconciliation-center-audit.mjs --output-dir docs/ops/runs`: PASS

## Next Gate

`CHANJET_P3_RECONCILIATION_CENTER_UI`

Recommended next actions:

1. Add visible reconciliation rows to the Chanjet integration / finance report UI.
2. Prioritize AR/AP and cash-account mappings.
3. Build subject-balance and statement field semantic mapping.
4. Keep `CHANJET_P4_WRITEBACK_PREP` blocked until P3 statuses are stable and reviewed.

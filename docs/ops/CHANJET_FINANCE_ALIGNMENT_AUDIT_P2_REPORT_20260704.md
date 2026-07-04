# Chanjet Finance Alignment Audit P2 Report

Date: 2026-07-04

## Objective

Build a repeatable local audit runner for the Chanjet finance alignment program, so ERP finance cards and mapping work are driven by evidence from the readonly middle layer instead of guessed numbers.

## Implemented

- Added `scripts/ops/chanjet-finance-alignment-audit.mjs`.
- Generated latest audit artifacts:
  - `docs/ops/runs/chanjet-finance-alignment-audit-latest.json`
  - `docs/ops/runs/chanjet-finance-alignment-audit-latest.md`
- The audit reads only local ERP readonly mirror tables:
  - `chanjet_read_snapshots`
  - `chanjet_entity_snapshots`
  - `chanjet_erp_field_mapping`
- `chanjet_sync_jobs` is treated as optional job evidence. If absent, endpoint job status is marked `UNAVAILABLE` and coverage is computed from the core readonly mirror tables.

## Latest Result

- Decision: `GO_WITH_CONDITIONS`
- Endpoint coverage: `0%`
- Finance card coverage: `0%`
- Field coverage: `0%`
- High/Critical open fields: `0`
- Local core middle-layer tables exist.
- Local mirror data rows are currently absent, so ERP finance cards must not claim Chanjet-aligned values from local evidence.

## Missing Endpoint Coverage

- `ACCOUNT_BOOKS`
- `DEPARTMENT`
- `CUSTOMER_SUPPLIER`
- `SUBJECT`
- `PROJECT`
- `FIN_ACCOUNT`
- `PAYABLE_STATISTICS`
- `RECEIVABLE_STATISTICS`
- `PAYMENT_AP`
- `PAYMENT_AR`
- `PURCHASE_ORDER`
- `VOUCHER_SEARCH`
- `GL_BALANCE`
- `BALANCE_SHEET`
- `INCOME_STATEMENT`
- `CASH_FLOW`

## Generated Improvement Tasks

1. `CHANJET-P0-READONLY-SYNC-GAPS`
   - 补齐未覆盖的好业财只读端点。
   - Owner: A3 + A5.

2. `CHANJET-P1-SYNC-JOB-AUDIT-EVIDENCE`
   - 补齐同步任务审计证据或接入生产 job evidence。
   - Owner: A1 + A3.

3. `CHANJET-P1-FINANCE-CARD-SOURCE-BADGES`
   - 财务卡片继续补来源、差异与待同步状态。
   - Owner: A4 + A1.

## Boundaries

- Chanjet write: no.
- Chanjet delete / modify: no.
- Voucher push: no.
- ERP business table write: no.
- Migration: no.
- Deploy / push: no.

## Next Step

Proceed with `CHANJET-P0-READONLY-SYNC-GAPS`: run or repair readonly sync so the ERP local middle layer contains all Chanjet finance-side endpoint data, then rerun this audit and only switch finance card authority when coverage evidence is present.

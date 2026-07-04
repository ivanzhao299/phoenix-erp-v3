# Chanjet P3 Finance Card Difference Visual QA Report

## Objective

Verify that Phoenix ERP finance cards do not silently use Chanjet mirror numbers unless the corresponding read model is `AUTHORITY_READY`, and that every finance card exposes source, Chanjet readonly value, ERP auxiliary value, visible difference, and blocker reason.

## Scope

- Backend authority endpoint: `GET /api/chanjet/integration/finance-card-authority`.
- Finance overview card wiring: `apps/api/src/modules/finance-v2/services/financial-reports.service.ts`.
- Finance report page: `/finance2/reports`.
- QA script: `scripts/ops/chanjet-finance-card-authority-qa.mjs`.

## QA Result

Decision: `GO_WITH_CONDITIONS`.

The QA script passed all 8 static and artifact-backed checks:

1. Finance card authority endpoint exists and is protected by `MENU_FIN2_AR:V`.
2. Only `AUTHORITY_READY` can feed primary finance cards.
3. Chanjet write/delete/modify/voucher push boundaries are explicit.
4. All 8 finance cards are covered by the authority service.
5. All 8 finance cards are rendered in the finance report panel.
6. UI displays source, Chanjet value, ERP auxiliary value, difference, and lock reason.
7. Finance overview consumes read model and receipt/payment lock evidence before card authority.
8. Today receipt/payment remain blocked unless date/status/direction lock allows card authority.

Generated artifacts:

- `docs/ops/runs/chanjet-finance-card-authority-qa-latest.json`
- `docs/ops/runs/chanjet-finance-card-authority-qa-latest.md`

## Finance Card Coverage

| Card | Service | UI | Authority Rule |
|---|---|---|---|
| 应收待收 | PASS | PASS | Chanjet only if `AUTHORITY_READY`; ERP remains auxiliary. |
| 应付待付 | PASS | PASS | Chanjet only if `AUTHORITY_READY`; ERP remains auxiliary. |
| 现金 / 银行余额 | PASS | PASS | Blocked until balance field semantics are locked. |
| 今日收款 | PASS | PASS | Blocked until business date/status/direction lock allows card authority. |
| 今日付款 | PASS | PASS | Blocked until business date/status/direction lock allows card authority. |
| 科目余额 | PASS | PASS | Blocked until subject balance fields are mapped. |
| 资产负债表关键项 | PASS | PASS | Blocked until statement row semantics are mapped. |
| 利润表关键项 | PASS | PASS | Blocked until statement row semantics are mapped. |

## Key Decision

Mirror coverage is not the same as finance authority.

ERP may show Chanjet readonly evidence and differences for all covered metrics, but the primary card value can switch to Chanjet only when the read model is `AUTHORITY_READY`. `READONLY_READY`, `BLOCKED_MAPPING`, `WAITING_SAMPLE`, and `NEED_MANUAL_REVIEW` must stay visible as blockers.

## Boundaries

- Chanjet write: NO.
- Chanjet delete/modify: NO.
- Voucher push: NO.
- ERP business table overwrite: NO.
- Migration: NO.
- DB write in this QA: NO.
- Deploy in this QA: NO.

## Validation

- `node --check scripts/ops/chanjet-finance-card-authority-qa.mjs`: PASS.
- `node scripts/ops/chanjet-finance-card-authority-qa.mjs --output-dir docs/ops/runs`: PASS.
- Previous implementation validation remains green:
  - API typecheck: PASS.
  - Web typecheck: PASS.
  - i18n gate: PASS.
  - W5 closeout gate with explicit freeze/security allow flags: PASS.
- Push/deploy for commit `c5583d50`: PASS via GitHub Actions run `28706512225`.

## Next Gate

`CHANJET_P3_FINANCE_CARD_SEMANTIC_LOCK_EXPANSION`

Recommended next work:

1. Lock cash/bank balance fields from Chanjet cash account and GL balance payloads.
2. Lock subject balance current/initial/debit/credit/end-balance semantics.
3. Lock balance sheet and income statement row keys and amount fields.
4. Keep today receipt/payment card authority blocked until finance confirms business date, posting date, approval status, void status, and direction semantics.
5. Keep Chanjet write-back HOLD until voucher draft approval, idempotency, retry, receipt, and rollback gates are complete.

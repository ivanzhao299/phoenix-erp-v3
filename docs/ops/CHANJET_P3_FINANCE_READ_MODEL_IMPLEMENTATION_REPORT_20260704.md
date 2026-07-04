# Chanjet P3 Finance Read Model Implementation Report

Date: 2026-07-04

Conclusion: GO WITH CONDITIONS

## Objective

Create a readonly Chanjet finance read model so ERP finance pages can clearly distinguish:

- Metrics that can be used as Chanjet authority candidates.
- Metrics that can only be shown as readonly evidence.
- Metrics that are blocked by missing semantic fields or manual review requirements.

## Changed Files

- `apps/api/src/modules/chanjet/chanjet-integration.service.ts`
- `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
- `apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`

## New Readonly API

Endpoint:

- `GET /api/chanjet/integration/finance-read-model`

Permission:

- `MENU_CHANJET_PROXY:V`

The API combines:

- Finance reconciliation status.
- Finance semantic locks.
- Finance semantic extractor output.
- ERP auxiliary values.

## Read Model Statuses

- `AUTHORITY_READY`: may feed primary ERP finance cards with visible ERP auxiliary difference.
- `READONLY_READY`: may be shown as readonly evidence, not as a primary card authority value.
- `BLOCKED_MAPPING`: required semantic fields are not locked.
- `WAITING_SAMPLE`: missing raw-data samples.
- `NEED_MANUAL_REVIEW`: date/status/direction semantics need finance review.
- `HOLD`: runtime or safety issue; do not consume.

## UI

Entry:

- `/finance2/chanjet-integration`

New tab:

- `财务 Read Model`

The tab shows:

- Authority-ready count.
- Readonly-ready count.
- P0 blocked count.
- Manual-review / waiting-sample count.
- Metric-level value source.
- ERP auxiliary value and difference.
- Missing required fields.
- Next action.

## Guardrails

- Chanjet write: No
- Chanjet delete or modify: No
- Voucher push: No
- ERP business-table overwrite: No
- Migration: No
- Production DB write: No

## Validation Results

- API typecheck: PASS
- Web typecheck: PASS
- i18n hardcoded literal gate: PASS
- Runtime memory JSON parse: PASS
- `git diff --check`: PASS
- CI/CD after push: pending at local validation time

## Current Conditions

The read model is runtime-only and does not create a new table. It is intentionally conservative: metrics blocked by missing semantic fields or manual review cannot feed primary finance cards.

## Next Gate

`CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK`

Lock receipt/payment business date, posting date, approved status, void status, and direction semantics before daily receipt/payment cards can use Chanjet values.

# Chanjet P3 Receipt / Payment Date Status Lock Report

Date: 2026-07-04

## Objective

Before ERP finance cards use Chanjet values for today receipt and today payment, lock the required business semantics:

- business date
- posting date
- approved status
- void status
- receipt/payment direction
- amount

This gate is read-only. It does not write Chanjet, does not push vouchers, and does not overwrite ERP business tables.

## Changed Files

- `apps/api/src/modules/chanjet/chanjet-integration.service.ts`
- `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
- `apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`
- `docs/ops/CHANJET_P3_RECEIPT_PAYMENT_DATE_STATUS_LOCK_REPORT_20260704.md`

## New Readonly API

`GET /api/chanjet/integration/receipt-payment-locks`

The endpoint reads ERP middle-layer Chanjet entity snapshots and returns candidate locks for:

- `TODAY_RECEIPT` from `AR_RECEIPT`
- `TODAY_PAYMENT` from `AP_PAYMENT`

Each lock includes:

- sample row count
- latest pull time
- required dimensions
- locked dimensions
- missing dimensions
- candidate field paths
- date/status/direction/amount rules
- whether finance review can start
- whether card authority wiring is allowed

## UI

Page: `/finance2/chanjet-integration`

New tab: `收付款日期状态锁`

The UI displays lock status, sample evidence, missing dimensions, candidate field paths, and guardrails.

## Guardrails

- Chanjet write: no
- Chanjet delete or modify: no
- voucher push: no
- ERP business-table overwrite: no
- migration: no
- finance homepage authority switch: no

## Current Decision

`GO_WITH_CONDITIONS`

The platform can now show receipt/payment date-status lock evidence, but finance cards must not switch to Chanjet authority values until the next gate confirms business date, posting date, status, direction, and amount semantics.

## Validation

- API typecheck: PASS (`apps/api ./node_modules/.bin/tsc --noEmit`)
- Web typecheck: PASS (`apps/web ./node_modules/.bin/tsc --noEmit`)
- i18n hardcoded literal gate: PASS (`node scripts/ci/check-i18n-hardcoded-literals.mjs --fail-on-uncovered --write-report`)
- `PROJECT_STATE.json` parse: PASS
- `git diff --check`: PASS

## Next Gate

`CHANJET_P3_FINANCE_CARD_AUTHORITY_WIRING`

Only finance-reviewed and authority-ready values should feed ERP finance cards. ERP auxiliary values and differences must remain visible.

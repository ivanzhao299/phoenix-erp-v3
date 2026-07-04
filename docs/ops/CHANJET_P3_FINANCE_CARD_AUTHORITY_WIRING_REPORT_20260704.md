# Chanjet P3 Finance Card Authority Wiring Report

Date: 2026-07-04

Decision: GO WITH CONDITIONS

## Goal

Wire Chanjet readonly finance data into ERP finance cards only when the metric has reached `AUTHORITY_READY`, while keeping ERP auxiliary values and differences visible.

## Changed Files

- `apps/api/src/modules/finance-v2/finance-v2.module.ts`
- `apps/api/src/modules/finance-v2/services/financial-reports.service.ts`
- `apps/api/src/modules/chanjet/chanjet-integration.service.ts`
- `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
- `apps/web/src/app/(admin)/finance2/reports/page.tsx`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`
- `apps/web/src/locales/zh.json`
- `apps/web/src/locales/en.json`
- `apps/web/src/locales/lo.json`
- `docs/ops/runs/i18n-hardcoded-literals-latest.json`
- `docs/ops/runs/i18n-hardcoded-literals-latest.md`
- `docs/ops/runs/i18n-auto-literals-latest.json`
- `docs/ops/runs/i18n-auto-literals-latest.md`

## Backend Result

- Added readonly endpoint: `GET /api/chanjet/integration/finance-card-authority`.
- Finance report overview now checks the Chanjet read model before using a Chanjet value as the card primary value.
- Only `AUTHORITY_READY` metrics can feed primary card values.
- `READONLY_READY`, `BLOCKED_MAPPING`, `WAITING_SAMPLE`, `NEED_MANUAL_REVIEW`, and `HOLD` remain comparison evidence only.
- Receipt/payment daily cards require the additional receipt/payment lock `readyForCardAuthority=true`; current status remains blocked until finance confirms date/status/direction semantics.

## Frontend Result

- `/finance2/reports` now shows a finance card authority wiring panel.
- Each card shows:
  - primary value source
  - authority wiring status
  - read model status
  - Chanjet readonly value
  - ERP auxiliary value
  - visible difference
  - blocker / next-action reason

## Guardrails

- Chanjet write: No.
- Chanjet delete / modify: No.
- Voucher push: No.
- ERP business-table overwrite: No.
- Migration executed: No.
- DB write executed: No.
- Deploy executed in this local gate: No.

## Validation

- API typecheck: PASS.
- Web typecheck: PASS.
- i18n gate: PASS.
- Runtime memory JSON parse: PASS.
- `git diff --check`: PASS.
- W5 closeout static gate with approved freeze/security flags for this Chanjet code gate: PASS.

## Current Conditions

1. Today receipt/payment cards must remain ERP-primary until finance confirms the business date, posting date, approval status, void status, direction, and amount semantics.
2. Chanjet mirrored statement and cash-account data must not be shown as a primary card value until the read model marks those metrics `AUTHORITY_READY`.
3. Any mismatch must remain visible; no silent overwrite is allowed.

## Next Gate

`CHANJET_P3_FINANCE_CARD_DIFF_VISUAL_QA`

Smoke the finance report UI and confirm that every card explains its source, read model status, Chanjet value, ERP auxiliary value, and difference.

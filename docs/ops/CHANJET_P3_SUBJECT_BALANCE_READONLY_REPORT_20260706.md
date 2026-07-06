# CHANJET P3 Subject Balance Readonly Report

## Goal

Expose Chanjet subject balance, balance sheet, and income statement data as ERP readonly report evidence before any voucher writeback or finance-card authority promotion.

## Implemented Scope

- Backend readonly API: `GET /api/chanjet/integration/subject-balance-readonly-report`.
- Frontend entry: `/finance2/chanjet-integration`, tab `科目/报表只读`.
- Static audit script: `scripts/ops/chanjet-subject-balance-readonly-report-audit.mjs`.
- Runtime memory updated to `CHANJET_P3_SUBJECT_BALANCE_READONLY_REPORT_IMPLEMENTED`.

## Report Coverage

The readonly report covers:

- `SUBJECT_BALANCE` from `GL_BALANCE`.
- `BALANCE_SHEET` from `BALANCE_SHEET`.
- `INCOME_STATEMENT` from `INCOME_STATEMENT`.

Each report exposes:

- report status,
- sample row count,
- latest pulled time,
- selected amount field candidates,
- missing required fields,
- blocker reasons,
- row-level evidence excerpt,
- next action.

## Guardrails

- Chanjet write: no.
- Chanjet delete: no.
- Chanjet modify: no.
- Voucher push: no.
- ERP business table overwrite: no.
- Migration: no.
- Deploy script change: no.

## A1 / A2 Review Scope

A1 validation must confirm:

- API typecheck passes.
- Web typecheck passes.
- W5 closeout gate passes with the approved app-code touch flags.
- Audit artifact exists under `docs/ops/runs`.

A2 review scope:

- Verify the endpoint remains read-only.
- Verify `MENU_FIN2_AR_LEDGER:V` protects the route.
- Verify the UI does not provide writeback, voucher push, or primary finance card switch actions.
- Verify raw evidence excerpts are compacted and sensitive token-like keys are redacted.

## Current Decision

`GO_WITH_CONDITIONS`

The readonly report layer is implemented. It is safe for ERP-side financial analysis and reconciliation, but it does not yet authorize Chanjet writeback, voucher push, or silent replacement of ERP finance card values.

## Next Gate

`CHANJET_P4_VOUCHER_DRAFT_PREP`

Prepare ERP voucher draft generation from approved readonly evidence only. Keep all Chanjet writeback blocked until a separate explicit write Gate is approved.

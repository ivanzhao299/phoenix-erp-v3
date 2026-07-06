# Chanjet Readonly Field Adapter Implementation Report

Date: 2026-07-07

## Objective

Implement the next Chanjet / ERP fusion gate after the field-gap review:

Observer / field-gap findings ->
readonly field adapters ->
admin review UI ->
future business-facing reconciliation wiring.

This gate keeps Chanjet as read-only. It does not write Chanjet data, does not push vouchers, and does not overwrite ERP business facts.

## Implemented Scope

### Backend

- Added readonly endpoint:
  - `GET /api/chanjet/integration/readonly-field-adapters`
- Permission:
  - `MENU_SETTINGS_CHANJET:V`
- Source tables:
  - `chanjet_entity_snapshots`
  - `chanjet_master_mapping`
- Adapter contracts:
  - `CHANJET_VOUCHER_HEADER`
  - `CHANJET_VOUCHER_LINE`
  - `CHANJET_COUNTERPARTY`

### Admin UI

- Added the `只读适配器` tab to:
  - `/finance2/chanjet-integration`
- UI displays:
  - adapter readiness
  - sample row counts
  - missing critical fields
  - voucher header rows
  - voucher line rows
  - counterparty mapping state
  - next actions

### Ops Tooling

- Added:
  - `scripts/ops/chanjet-readonly-field-adapter-audit.mjs`
- Output artifacts:
  - `docs/ops/runs/chanjet-readonly-field-adapter-audit-latest.json`
  - `docs/ops/runs/chanjet-readonly-field-adapter-audit-latest.md`

The script reads the readonly API and persists an audit snapshot. It does not trigger sync, write Chanjet, push vouchers, migrate, deploy, or write ERP business tables.

## Adapter Rules

### Voucher Header

Maps safe header fields from mirrored `VOUCHER` rows:

- voucher id
- voucher number
- book id
- period
- voucher date
- posting date
- status
- summary
- maker
- reviewer

### Voucher Line

Attempts to extract line arrays from common Chanjet payload shapes:

- `entries`
- `entryList`
- `items`
- `lines`
- `details`
- `detailList`
- `voucherLines`
- `voucherDetails`
- `voucherDetailsList`
- `acctgTransDetails`
- `acctgTransItems`
- `children`
- `rows`

If no line array is present, the adapter is `PARTIAL` or `HOLD` and reports `voucher_line_items` as a missing critical field.

### Counterparty

Maps mirrored `CUSTOMER_SUPPLIER` rows and joins approved/pending ERP master mappings where available.

Counterparty rows remain review-only until CUSTOMER / SUPPLIER mappings are approved.

## Guardrails

- Chanjet write: no
- Chanjet delete: no
- Chanjet modify: no
- Voucher push: no
- ERP business table overwrite: no
- Migration: no
- DB write: no
- Ordinary user middle-layer visibility: no

## Modified Files

- `apps/api/src/modules/chanjet/chanjet-integration.service.ts`
- `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
- `apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx`
- `scripts/ops/chanjet-readonly-field-adapter-audit.mjs`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`
- `docs/ops/runtime-memory/GUARDRAILS.md`
- `docs/ops/CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION_REPORT_20260707.md`

## Validation Plan

- `node --check scripts/ops/chanjet-readonly-field-adapter-audit.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `node scripts/ci/check-w5-closeout-gate.mjs`
- production deploy workflow after push

## Current Decision

GO WITH CONDITIONS

## Conditions

1. Production adapter row quality depends on current production mirror samples.
2. Counterparty adapter remains gated by approved CUSTOMER / SUPPLIER mapping.
3. Voucher line extraction remains fail-closed if Chanjet payload samples do not include recognizable line arrays.
4. Ordinary users must not see the middle-layer UI.
5. Chanjet write-back and voucher push remain HOLD.

## Next Plan

1. Run production readonly adapter audit with an admin token.
2. Wire validated adapter output into reconciliation views.
3. Expose only business-level source badges and differences on ordinary pages.
4. Continue P2/P3 master mapping and financial card authority gates.
5. Keep write-back disabled until a dedicated P4 approval gate.

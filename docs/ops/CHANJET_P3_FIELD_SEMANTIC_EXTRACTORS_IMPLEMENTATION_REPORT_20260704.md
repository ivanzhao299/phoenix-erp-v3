# Chanjet P3 Field Semantic Extractors Implementation Report

Date: 2026-07-04

Conclusion: GO WITH CONDITIONS

## Objective

Advance the Chanjet integration from field semantic locks to runtime semantic field extraction.

The goal is to prevent ERP finance cards from treating mirror coverage, `amountSum=0`, or list counts as authoritative Chanjet financial values before the actual Chanjet raw fields are identified and reviewed.

## Changed Files

- `apps/api/src/modules/chanjet/chanjet-integration.service.ts`
- `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
- `apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx`
- `docs/ops/runtime-memory/PROJECT_STATE.json`
- `docs/ops/runtime-memory/NEXT_ACTIONS.md`
- `docs/ops/runtime-memory/DECISION_LOG.md`

## New Readonly API

Endpoint:

- `GET /api/chanjet/integration/finance-semantic-extractors`

Permission:

- `MENU_CHANJET_PROXY:V`

Behavior:

- Reads ERP middle-layer `chanjet_entity_snapshots.raw_data`.
- Builds semantic field candidates for finance reconciliation metrics.
- Reports sample row count, latest pull time, candidate raw paths, missing required fields, and authority eligibility.
- Does not call Chanjet write APIs.
- Does not overwrite ERP business tables.

## Extractor Scope

Covered finance metrics:

- `AR_OPEN`
- `AP_OPEN`
- `CASH_BALANCE`
- `TODAY_RECEIPT`
- `TODAY_PAYMENT`
- `SUBJECT_BALANCE`
- `BALANCE_SHEET`
- `INCOME_STATEMENT`
- `CASH_FLOW`
- `VOUCHER_LIST`

The extractor uses each semantic lock's pending fields, scans recent raw samples, and proposes candidate raw paths by field intent.

## UI

Entry:

- `/finance2/chanjet-integration`

New tab:

- `语义提取器`

Displayed evidence:

- Extractor status.
- Sample rows and latest pull time.
- Locked fields progress.
- Candidate raw paths.
- Missing required fields.
- Next action.
- Guardrails.

## Guardrails

- Chanjet write: No
- Chanjet delete or modify: No
- Voucher push: No
- ERP business-table overwrite: No
- Migration: No
- Production deploy: No
- Production DB write: No

## Validation

- API typecheck: PASS
- Web typecheck: PASS
- Runtime memory JSON parse: pending final validation
- i18n hardcoded literal gate: pending final validation
- W5 closeout gate: pending final validation

## Conditions

The extractor is a candidate generator, not a final accounting authority.

Before ERP finance cards can use Chanjet values as authoritative:

1. Required semantic fields must be found in raw samples.
2. Candidate paths must be promoted into a readonly finance read model.
3. Daily receipt/payment must lock business date and approved/void status semantics.
4. Differences between ERP auxiliary values and Chanjet values must remain visible.

## Next Gate

`CHANJET_P3_FINANCE_READ_MODEL`

Build a readonly finance read model from READY extractors only. Keep P4 writeback preparation blocked until the read model is stable and reviewed.

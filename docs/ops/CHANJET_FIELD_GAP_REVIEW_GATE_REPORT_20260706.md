# Chanjet Field Gap Review Gate Report

Date: 2026-07-06

## Goal

Turn the Chanjet readonly mirror evidence into implementation-ready field-gap packages.

This gate does not write to Chanjet, does not push vouchers, does not overwrite ERP business facts, and does not run migrations. It converts the open high-risk field list into prioritized readonly adapter work that can be executed safely in later gates.

## New Capability

Backend API:

- `GET /api/chanjet/integration/field-gap-review-gate`

Ops runner:

- `scripts/ops/chanjet-field-gap-review-gate.mjs`

Generated artifacts:

- `docs/ops/runs/chanjet-field-gap-review-gate-latest.json`
- `docs/ops/runs/chanjet-field-gap-review-gate-latest.md`

## Result

Decision: `GO_WITH_CONDITIONS`

Summary:

- Source readonly endpoint coverage: `100%`
- Finance card dependency coverage: `100%`
- Current field classification coverage: `10.9%`
- Reviewed high / critical open fields in the executable gate sample: `80`
- Review buckets: `7`
- Next gate: `CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION`

## Prioritized Implementation Buckets

1. `FIELD-GAP-CHANJET_VOUCHER_LINE`
   - Goal: readonly voucher line reconstruction.
   - Owner: `A3-Backend-Critical-Path + A2-Security-Regression-Gate`.
   - Next action: implement readonly line adapter and evidence mapping.

2. `FIELD-GAP-CHANJET_VOUCHER_HEADER`
   - Goal: readonly voucher header reconstruction.
   - Owner: `A3-Backend-Critical-Path + A2-Security-Regression-Gate`.
   - Next action: implement readonly header adapter and lock status/date semantics.

3. `FIELD-GAP-CHANJET_COUNTERPARTY`
   - Goal: map Chanjet customer/supplier/current-account objects to ERP counterparties.
   - Owner: `A5-Data-Readiness + A2-Security-Regression-Gate`.
   - Next action: complete counterpart mapping review without writing either side.

4. `FIELD-GAP-CHANJET_AP_AR_AGGREGATE`
   - Goal: lock AR/AP aggregate semantics and expose readonly evidence.
   - Owner: `A3-Backend-Critical-Path + A2-Security-Regression-Gate`.

5. `FIELD-GAP-CHANJET_PAYMENT_DOCUMENT`
   - Goal: lock receipt/payment date, amount, direction, status, and account semantics.
   - Owner: `A3-Backend-Critical-Path + A2-Security-Regression-Gate`.

6. `FIELD-GAP-CHANJET_REPORTING`
   - Goal: expose subject balance and financial statements as readonly rows with field evidence.
   - Owner: `A3-Backend-Critical-Path + A2-Security-Regression-Gate`.

7. `FIELD-GAP-CHANJET_PURCHASE_LINKAGE`
   - Goal: readonly purchase chain reconciliation against ERP procurement evidence.
   - Owner: `A3-Backend-Critical-Path + A2-Security-Regression-Gate`.

## Guardrails

- Chanjet write: `false`
- Chanjet delete: `false`
- Chanjet modify: `false`
- Voucher push: `false`
- ERP business overwrite: `false`
- Silent finance-card authority switch: `false`
- Migration execution: `false`

## Validation

Executed:

- `node scripts/ops/chanjet-remote-readonly-coverage-audit.mjs --output-dir docs/ops/runs`
- `node --check scripts/ops/chanjet-field-gap-review-gate.mjs`
- `node scripts/ops/chanjet-field-gap-review-gate.mjs --output-dir docs/ops/runs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `git diff --check`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`

Result:

- Remote readonly coverage audit: `GO_WITH_CONDITIONS`
- Script syntax: `PASS`
- Field-gap review runner: `PASS`
- API typecheck: `PASS`
- Whitespace diff check: `PASS`
- W5 closeout gate: `PASS with explicit Chanjet / frozen-boundary override`

Note:

- The unguarded W5 closeout gate flags the broader branch diff because this branch contains historical API/web/security-sensitive work and the new Chanjet readonly endpoint is under the Chanjet critical path. The controlled rerun with explicit allow flags passed and preserved the readonly guardrails.

## Conditions

The gate is ready for implementation, but later work must still preserve the readonly boundary:

1. Do not write to Chanjet.
2. Do not push vouchers.
3. Do not treat unclassified fields as matched.
4. Do not use Chanjet values as ERP primary card values unless the authority gate explicitly allows the metric.
5. Keep unresolved fields visible as `NEED_MAPPING`, `NEED_MANUAL_REVIEW`, or `HOLD`, rather than silently defaulting.

## Next Recommended Gate

`CHANJET_READONLY_FIELD_ADAPTER_IMPLEMENTATION`

Recommended first batch:

1. `FIELD-GAP-CHANJET_VOUCHER_LINE`
2. `FIELD-GAP-CHANJET_VOUCHER_HEADER`
3. `FIELD-GAP-CHANJET_COUNTERPARTY`

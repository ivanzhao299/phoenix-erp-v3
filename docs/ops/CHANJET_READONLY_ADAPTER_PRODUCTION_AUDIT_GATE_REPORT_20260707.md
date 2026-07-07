# Chanjet Readonly Adapter Production Audit Gate Report

Date: 2026-07-07

## Objective

Continue the Chanjet / ERP fusion path after the readonly field adapter implementation.

This gate turns the adapter audit into a production-safe, repeatable check:

1. Query the production readonly adapter endpoint.
2. Persist JSON / Markdown evidence.
3. Quantify adapter readiness and field coverage.
4. Fail closed when authentication evidence is missing.
5. Keep Chanjet write-back and voucher push forbidden.

## Changes

### Backend

- Added `fieldCoverage` to the readonly adapter summary returned by:
  - `GET /api/chanjet/integration/readonly-field-adapters`

### Admin UI

- Updated `/finance2/chanjet-integration#readonlyAdapters` to show:
  - ready adapters
  - voucher header / line sample counts
  - counterparty sample count
  - field coverage
  - next Gate

### Ops Audit

- Enhanced `scripts/ops/chanjet-readonly-field-adapter-audit.mjs`.
- The tool now supports:
  - `--token`
  - `PHOENIX_ADMIN_TOKEN`
  - `PHOENIX_AUTH_TOKEN`
  - `PHOENIX_ERP_RUNNER_USER` + `PHOENIX_ERP_RUNNER_PASS`
- If authentication is unavailable or rejected, it writes a HOLD report instead of returning a false PASS.

## Production Audit Result

Command:

```bash
node scripts/ops/chanjet-readonly-field-adapter-audit.mjs \
  --api-base https://erp.eggslao.com/api \
  --output-dir docs/ops/runs
```

Result:

- Decision: `HOLD`
- Endpoint: `https://erp.eggslao.com/api/chanjet/integration/readonly-field-adapters`
- Auth source: `none`
- HTTP result: `401`
- JSON evidence:
  - `docs/ops/runs/chanjet-readonly-field-adapter-audit-latest.json`
- Markdown evidence:
  - `docs/ops/runs/chanjet-readonly-field-adapter-audit-latest.md`

This is the correct fail-closed behavior. The audit did not fabricate sample counts or field coverage.

## Guardrails

- Chanjet write: no
- Chanjet delete: no
- Chanjet modify: no
- Voucher push: no
- ERP business data overwrite: no
- Migration: no
- Production DB write: no

## Current Decision

GO WITH CONDITIONS

The audit gate is implemented and safe. Production sample verification is HOLD until an approved runtime token or service-account login is available to the audit runner.

## Next Gate

`CHANJET_READONLY_ADAPTER_AUTHENTICATED_AUDIT`

Required before ordinary finance pages consume adapter data:

1. Provide a dedicated readonly audit service account or short-lived admin token.
2. Re-run the adapter audit against production.
3. Verify voucher header / line / counterparty samples.
4. Only then wire validated adapter output into reconciliation views.
5. Keep ordinary users away from middle-layer pages.


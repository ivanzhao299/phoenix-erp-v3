# Chanjet Readonly Adapter Authenticated Audit CI Gate

Date: 2026-07-07

## Objective

Move the Chanjet readonly field adapter audit from a local fail-closed check to a repeatable authenticated production CI gate.

The gate must verify voucher header, voucher line, and counterparty adapter evidence before adapter output can be used by ordinary business-facing finance pages.

## Implemented

- Added GitHub Actions smoke target `chanjet-readonly-adapter-production`.
- Added `node --check scripts/ops/chanjet-readonly-field-adapter-audit.mjs` to smoke validation.
- Reused the existing production deploy SSH/proxy channel instead of direct runner SSH.
- Minted a 20-minute runtime admin JWT inside the production API container.
- Ran the readonly adapter audit against:
  - `https://erp.eggslao.com/api/chanjet/integration/readonly-field-adapters`
- Pulled sanitized artifacts back into `docs/ops/runs/`:
  - `chanjet-readonly-field-adapter-audit-latest.json`
  - `chanjet-readonly-field-adapter-audit-latest.md`

## Runtime Authorization

No long-lived token is stored in the repository, GitHub workflow file, runtime memory, or audit report.

The workflow obtains temporary authorization by:

1. SSHing to the production server through the same path as deployment.
2. Reading the active admin user id and `perms_version`.
3. Creating a short-lived JWT inside the production API container using runtime `JWT_SECRET`.
4. Passing that token only as `PHOENIX_ADMIN_TOKEN` to the readonly adapter audit process.

## Manual Workflow Target

Workflow: `AI Delivery CI Smoke`

Target: `chanjet-readonly-adapter-production`

The production command is:

```bash
PHOENIX_ADMIN_TOKEN="$TOKEN" node scripts/ops/chanjet-readonly-field-adapter-audit.mjs \
  --api-base=https://erp.eggslao.com/api \
  --output-dir=docs/ops/runs
```

## Boundaries

- Chanjet write: no
- Chanjet delete: no
- Chanjet modify: no
- Voucher push: no
- ERP business table overwrite: no
- Migration: no
- Deploy: no
- Production DB write: no
- Long-lived token committed: no

## Expected Evidence

The authenticated audit must report:

- decision
- total adapters
- ready / partial / waiting sample / hold counts
- voucher header sample rows
- voucher line sample rows
- counterparty sample rows
- field coverage
- blockers, if any

If authentication, endpoint access, or sample evidence fails, the tool must return `HOLD` and keep ordinary finance pages on ERP source plus visible mapping / difference notices.

## Authenticated Audit Result

Workflow run:

- `AI Delivery CI Smoke`
- target: `chanjet-readonly-adapter-production`
- run: `28834627546`
- result: `success`

Audit result:

- decision: `GO_WITH_CONDITIONS`
- total adapters: `3`
- ready adapters: `0`
- partial adapters: `3`
- waiting sample: `0`
- hold: `0`
- voucher header rows: `60`
- voucher line rows: `160`
- counterparty rows: `120`
- field coverage: `86.2%`
- auth source: short-lived token

Adapter conditions:

|Adapter|Status|Sample rows|Condition|
|---|---:|---:|---|
|`CHANJET_VOUCHER_HEADER`|`PARTIAL`|60|`voucher_status` still needs semantic lock.|
|`CHANJET_VOUCHER_LINE`|`PARTIAL`|160|`subject_code` and `subject_name` still need semantic lock.|
|`CHANJET_COUNTERPARTY`|`PARTIAL`|120|Customer / supplier mapping is not approved enough for ordinary business-page adoption.|

## Current Status

GO WITH CONDITIONS.

The authenticated production audit is now working and has real sample evidence. It is not yet a full GO for ordinary-page adoption because all three adapter domains remain `PARTIAL`.

## Next Gate

`CHANJET_READONLY_FIELD_ADAPTER_REVIEW_AND_SAMPLE_SYNC`

Lock the remaining voucher status, subject, and counterparty mapping semantics before any ordinary finance page treats adapter values as authoritative.

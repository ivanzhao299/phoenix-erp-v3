# Chanjet Readonly Production Sync CI Gate

Date: 2026-07-04

## Objective

Turn the Chanjet readonly mirror sync from a local manual command into a controlled GitHub Actions gate so the production API can execute the sync with an approved token, collect coverage evidence, and preserve fail-closed behavior.

## Implemented

- Added `chanjet-readonly-production` to `.github/workflows/ci-smoke.yml`.
- Added `node --check scripts/ops/chanjet-readonly-mirror-sync.mjs` to smoke validation.
- Added artifact upload for `docs/ops/runs/**` on manual smoke runs.
- Enhanced `scripts/ops/chanjet-readonly-mirror-sync.mjs` with remote protected API mode:
  - `--remote-api-only`
  - production API health check
  - protected finance coverage endpoint check
  - post-sync coverage refresh
  - no local Postgres requirement when the target is a remote API.

## Required Secret

The manual workflow target requires:

- `PHOENIX_ADMIN_TOKEN`

The token must belong to an approved operator account that can call:

- `GET /api/chanjet/integration/finance-coverage`
- `POST /api/chanjet/integration/mirror/sync`

## Manual Workflow Target

Use GitHub Actions:

- Workflow: `AI Delivery CI Smoke`
- Target: `chanjet-readonly-production`

The job runs:

```bash
node scripts/ops/chanjet-readonly-mirror-sync.mjs \
  --execute \
  --remote-api-only \
  --api-base=https://erp.eggslao.com \
  --output-dir=docs/ops/runs
```

## Boundaries

- Write Chanjet: no
- Delete Chanjet data: no
- Modify Chanjet data: no
- Push vouchers: no
- ERP middle-layer write: yes, only through the approved readonly mirror API
- ERP business table overwrite: no
- Production deploy from this workflow: no

## Local Verification

- `node --check scripts/ops/chanjet-readonly-mirror-sync.mjs`: PASS
- `.github/workflows/ci-smoke.yml` YAML parse: PASS
- Remote dry-run without token: HOLD, expected fail-closed result

## Current Status

READY FOR SECRET-BACKED EXECUTION.

The code path is deployed and protected. The remaining action is to provide `PHOENIX_ADMIN_TOKEN` as a GitHub Actions secret and run the `chanjet-readonly-production` target. Until then, real Chanjet readonly sync remains HOLD by design.

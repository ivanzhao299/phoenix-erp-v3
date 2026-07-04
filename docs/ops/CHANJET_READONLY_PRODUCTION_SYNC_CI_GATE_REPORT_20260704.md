# Chanjet Readonly Production Sync CI Gate

Date: 2026-07-04

## Objective

Turn the Chanjet readonly mirror sync from a local manual command into a controlled GitHub Actions gate so the production API can execute the sync with an approved token, collect coverage evidence, and preserve fail-closed behavior.

## Implemented

- Added `chanjet-readonly-production` to `.github/workflows/ci-smoke.yml`.
- Added `node --check scripts/ops/chanjet-readonly-mirror-sync.mjs` to smoke validation.
- Added `node --check scripts/ops/mint-production-admin-token-over-ssh.mjs` to smoke validation.
- Added `scripts/ops/mint-production-admin-token-over-ssh.mjs` so the workflow can mint a short-lived admin JWT inside the production API container using the production `JWT_SECRET`.
- Added artifact upload for `docs/ops/runs/**` on manual smoke runs.
- Enhanced `scripts/ops/chanjet-readonly-mirror-sync.mjs` with remote protected API mode:
  - `--remote-api-only`
  - production API health check
  - protected finance coverage endpoint check
  - post-sync coverage refresh
  - no local Postgres requirement when the target is a remote API.

## Runtime Authorization

The first manual run failed closed because `PHOENIX_ADMIN_TOKEN` was not configured:

```text
No PHOENIX_ADMIN_TOKEN / PHOENIX_AUTH_TOKEN provided for protected mirror API.
Chanjet configuration/token chain is not visible to this runner.
```

The corrected workflow no longer requires a long-lived `PHOENIX_ADMIN_TOKEN` secret. Instead, for the `chanjet-readonly-production` target it uses existing deploy SSH secrets to:

1. SSH to the production server.
2. Read the active `admin` user id and `perms_version` from the production database.
3. Generate a 20-minute JWT inside the production API container from the runtime `JWT_SECRET`.
4. Mask the token in GitHub logs.
5. Call the protected production API from the GitHub runner.

Required GitHub Secrets are the existing deploy secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PORT` if not 22
- `DEPLOY_PATH` if not `~/phoenix-erp`

The short-lived runtime token is only used for:

- `GET /api/chanjet/integration/finance-coverage`
- `POST /api/chanjet/integration/mirror/sync`

## Manual Workflow Target

Use GitHub Actions:

- Workflow: `AI Delivery CI Smoke`
- Target: `chanjet-readonly-production`

The job runs:

```bash
node scripts/ops/mint-production-admin-token-over-ssh.mjs
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
- `node --check scripts/ops/mint-production-admin-token-over-ssh.mjs`: PASS
- `.github/workflows/ci-smoke.yml` YAML parse: PASS
- First remote execution without token: HOLD, expected fail-closed result
- Workflow updated to mint a short-lived production token instead of requiring a long-lived token secret.

## Current Status

READY FOR SSH-BACKED SHORT-LIVED TOKEN EXECUTION.

The code path is protected. The next run of `chanjet-readonly-production` should mint a temporary runtime token and execute the readonly mirror sync without exposing or storing a long-lived admin token.

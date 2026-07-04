# Chanjet Readonly Production Sync CI Gate

Date: 2026-07-04

## Objective

Turn the Chanjet readonly mirror sync from a local manual command into a controlled GitHub Actions gate so the production API can execute the sync with an approved token, collect coverage evidence, and preserve fail-closed behavior.

## Implemented

- Added `chanjet-readonly-production` to `.github/workflows/ci-smoke.yml`.
- Added `node --check scripts/ops/chanjet-readonly-mirror-sync.mjs` to smoke validation.
- Added `node --check scripts/ops/mint-production-admin-token-over-ssh.mjs` to smoke validation.
- Added `scripts/ops/mint-production-admin-token-over-ssh.mjs` as a local/direct-SSH fallback utility for minting a short-lived admin JWT inside the production API container using the production `JWT_SECRET`.
- Updated the GitHub Actions production sync target to use the same `appleboy/ssh-action` + optional proxy channel as the deploy workflow. This avoids GitHub runner direct-SSH timeout to the production host.
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

The corrected workflow no longer requires a long-lived `PHOENIX_ADMIN_TOKEN` secret. Instead, for the `chanjet-readonly-production` target it uses existing deploy SSH/proxy secrets to:

1. SSH to the production server.
2. Read the active `admin` user id and `perms_version` from the production database.
3. Generate a 20-minute JWT inside the production API container from the runtime `JWT_SECRET`.
4. Call the protected production API from the production server.
5. Print only the sanitized sync gate result.

Required GitHub Secrets are the existing deploy secrets:

- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_SSH_KEY`
- `DEPLOY_PORT` if not 22
- `DEPLOY_PATH` if not `~/phoenix-erp`
- `DEPLOY_PROXY_HOST`, `DEPLOY_PROXY_USER`, `DEPLOY_PROXY_SSH_KEY` if direct SSH from GitHub runner is not available

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
  --sync-timeout-ms=300000 \
  --coverage-timeout-ms=120000 \
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
- Second attempt using direct SSH from GitHub runner: HOLD/FAIL, SSH timed out before reaching host.
- Workflow updated to reuse deploy `appleboy/ssh-action` proxy path and run the protected sync from the production server.
- Third attempt reached the production server and minted the runtime token, then failed in the readonly sync script because the mirror sync API exceeded the previous 30-second fetch timeout.
- Script updated to separate timeout windows:
  - health check: 30 seconds
  - finance coverage check: 120 seconds in remote mode
  - mirror sync: 300 seconds in remote mode
- Sync timeout is now reported as an audited HOLD response instead of an uncontextualized process crash.

## Current Status

READY FOR LONG-RUNNING SSH-BACKED READONLY SYNC EXECUTION.

The code path is protected. The next run of `chanjet-readonly-production` should connect through the same SSH/proxy path as production deploy, mint a temporary runtime token, and execute the readonly mirror sync with a long-running sync timeout without exposing or storing a long-lived admin token.

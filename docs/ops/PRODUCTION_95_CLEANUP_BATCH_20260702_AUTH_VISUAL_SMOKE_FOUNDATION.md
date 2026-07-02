# Production 95 Cleanup Batch - Authenticated And Product Page Smoke Foundation

Date: 2026-07-02
Owner: Codex-Orchestrator
Scope: P0-A / P1-E from `PRODUCTION_READINESS_RESCORE_AND_BOOST_PLAN_20260702.md`

## Objective

Continue production debt cleanup by turning two recurring weaknesses into repeatable gates:

1. Authenticated role and business-flow smoke must be explicit. If safe smoke credentials are unavailable, the result must be `SKIP_CREDENTIALS`, not a fake PASS.
2. Product page smoke must cover user-reported high-value pages for page failure, missing value signals, poor empty-state coverage, and unsafe attachment/link patterns.

## Changes

### Authenticated Business Smoke

New script:

- `scripts/ops/authenticated-business-smoke.mjs`

Capabilities:

- Reads `SMOKE_USER` / `SMOKE_PASS` or `PHOENIX_SMOKE_USER` / `PHOENIX_SMOKE_PASS`.
- Logs in via `POST /api/auth/login`.
- Validates `GET /api/auth/me`.
- Probes high-frequency read surfaces with the token:
  - workflow tasks,
  - system alerts,
  - system monitor health,
  - UAT readiness,
  - IoT all-summary,
  - procurement payments/orders,
  - finance dashboard/shareholder summary,
  - Store Payment accounts/records.
- Fails on HTTP 500, PG parameter text, stack traces, or unexpected required auth failure.
- Without credentials, writes a clear `SKIP_CREDENTIALS` report.
- Executes no DB write, migration, deploy, restart, or push.

Latest result:

- Decision: `SKIP_CREDENTIALS`
- Reason: no safe smoke credentials are present in the local environment.
- Artifact:
  - `docs/ops/runs/authenticated-business-smoke-latest.json`
  - `docs/ops/runs/authenticated-business-smoke-latest.md`

### Product Page Smoke

New script:

- `scripts/ops/product-page-smoke.mjs`

Covered routes:

- `/dashboard`
- `/system/health`
- `/system/alerts`
- `/uat`
- `/analytics/inventory`
- `/breeding/device`
- `/procurement2/payments/new`
- `/procurement2/orders/new`
- `/workflow/tasks/todo`
- `/shareholders/capital`
- `/mobile/expenses`

Checks:

- Source-level value signals exist for each page.
- Source-level quality/empty-state/safety signals exist.
- No direct `/uploads` href.
- No `window.open('/uploads/...')`.
- No `storage_path` / `storagePath` exposure.
- HTTP route does not return 404/5xx/page-failure text.

Latest result:

- Decision: `GO`
- PASS: `22`
- WARN: `0`
- FAIL: `0`
- Artifact:
  - `docs/ops/runs/product-page-smoke-latest.json`
  - `docs/ops/runs/product-page-smoke-latest.md`

### CI Smoke Workflow

Updated:

- `.github/workflows/ci-smoke.yml`

Changes:

- PR validation now runs syntax checks for:
  - `runtime-smoke-check.mjs`
  - `product-page-smoke.mjs`
  - `authenticated-business-smoke.mjs`
- Manual workflow target `product-pages` can run production product-page smoke.
- Manual workflow target `authenticated-production` can run authenticated smoke using `PHOENIX_SMOKE_USER` / `PHOENIX_SMOKE_PASS` GitHub secrets.

## Validation

| Command | Result |
| --- | --- |
| `node --check scripts/ops/authenticated-business-smoke.mjs` | PASS |
| `node --check scripts/ops/product-page-smoke.mjs` | PASS |
| `node scripts/ops/product-page-smoke.mjs --output-dir docs/ops/runs` | GO, 22 pass / 0 warn / 0 fail |
| `node scripts/ops/authenticated-business-smoke.mjs --output-dir docs/ops/runs` | SKIP_CREDENTIALS |

## Score Impact

This batch does not claim full 95+ readiness by itself because authenticated smoke still needs approved safe credentials. It does, however, close the tooling gap that previously allowed UI regressions and credential gaps to remain invisible.

Expected readiness impact after this batch:

- Frontend / Performance / i18n: `80 -> 83` candidate.
- Testing / CI/CD: `81 -> 84` candidate.
- Security / RBAC / DataScope: remains `90` until authenticated role-specific smoke executes with approved credentials.

## Remaining Conditions

1. Add approved smoke credentials as GitHub secrets:
   - `PHOENIX_SMOKE_USER`
   - `PHOENIX_SMOKE_PASS`
2. Run `authenticated-production` workflow against production or an approved staging target.
3. Expand the product-page smoke from source/HTTP checks into screenshot artifacts when the browser environment is available.
4. Add role-specific profile expectations for finance, procurement, warehouse, production, shareholder, and store-payment users.

## Safety

- Business code changed: No.
- DB write executed: No.
- Migration executed: No.
- Deployment executed: No.
- Restart executed: No.
- Push executed: No.

## Conclusion

GO WITH CONDITIONS.

The product page smoke foundation is now green and CI-visible. The authenticated smoke foundation is implemented and safely reports `SKIP_CREDENTIALS` until approved smoke credentials are supplied.

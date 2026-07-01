# Production 95 Cleanup Batch - Runtime Smoke Gate

Generated at: 2026-07-01

## Objective

Turn the recent UI/runtime incidents into a repeatable production smoke gate instead of one-off manual checks.

Covered incidents:

- Dashboard aggregation cards showing unclear or broken content.
- System health page showing degraded runtime signals without a CI-visible smoke gate.
- Alert center appearing empty without clear append-only value.
- UAT readiness page rendering a generic page failure.
- Mobile device page missing diagnostics when device data is unavailable.
- Procurement payment page project selector / attachment requirements.
- Protected attachment pages must not expose raw URLs or `/uploads` links.

## Changes

- Added `scripts/ops/runtime-smoke-check.mjs`.
- Updated `.github/workflows/ci-smoke.yml` so PRs validate the smoke checker and manual workflow dispatch can run production runtime smoke.
- Clarified the alert center page as an append-only operational audit surface.
- Generated latest smoke artifacts:
  - `docs/ops/runs/runtime-smoke-check-latest.json`
  - `docs/ops/runs/runtime-smoke-check-latest.md`

## Production Smoke Result

Command executed locally against production URL:

```bash
node scripts/ops/runtime-smoke-check.mjs --base-url=https://erp.eggslao.com --api-url=https://erp.eggslao.com --output-dir=docs/ops/runs
```

Result:

- Decision: GO
- PASS: 27
- WARN: 0
- FAIL: 0

Key checks:

- `/uat` no longer trips the runtime failure detector.
- `/system/health` loads without 404/5xx/page-failure text.
- `/system/alerts` has explicit append-only purpose and protected API fail-closed behavior.
- `/dashboard` has a static page gate for the system dashboard entry.
- `/mobile/device` keeps diagnostics visible when runtime data is unavailable.
- `/procurement2/payments/new` retains project selector and managed attachment uploader coverage.
- Protected endpoints return 401/403 when unauthenticated.
- Direct `/uploads` probe does not expose a file.

## Boundaries

- Business code changed: no, except one system alert page explanatory UI copy.
- DB write: no.
- Migration: no.
- Deployment command executed locally: no.
- Push: pending this batch commit.

## Score Impact

- Observability / operations: D -> C+ candidate after runtime smoke is merged and CI-visible.
- Frontend runtime confidence: C+ -> B- candidate for covered routes.
- Security attachment guard: remains PASS for no raw `/uploads` exposure in covered pages.

## Remaining Cleanup Backlog

Next high-value batches:

1. Add authenticated smoke for role-specific menu visibility and high-frequency workflows.
2. Add alert-to-human delivery checks so system warnings have an owner.
3. Run and document restore drill evidence.
4. Extend runtime smoke to procurement order OCR, approval action modal, mobile reimbursement upload, and finance dashboard.
5. Continue master-data readiness cleanup for supplier / project / cash-account / product / bank-account / warehouse.

## Conclusion

GO WITH CONDITIONS.

The first runtime smoke gate is now available and production currently passes the unauthenticated/static smoke surface. Authenticated business-flow smoke remains the next required cleanup layer before claiming 95+ production readiness.

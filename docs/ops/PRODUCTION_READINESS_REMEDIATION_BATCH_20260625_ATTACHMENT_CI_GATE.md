# Production Readiness Remediation Batch - Attachment CI Gate

Date: 2026-06-25

## Scope

This batch continues the P1 file and attachment convergence work by adding a static W5 gate for unsafe frontend attachment references.

## Changes

- Added `scripts/ci/check-unsafe-attachment-refs.mjs`.
- Added the unsafe attachment reference gate to `scripts/ci/check-w5-closeout-gate.mjs`.

## Gate Behavior

The gate scans tracked frontend source files under `apps/web/src` and fails on new direct patterns that can reintroduce unsafe attachment access:

- literal `/uploads` references
- `rawUrl` usage outside the approved Store Payment protected UI
- direct `window.open(...)`
- attachment-shaped direct `href={...}` expressions

Approved exceptions:

- `apps/web/src/lib/attachments.ts` because it defines the unsafe-reference detector.
- `apps/web/src/app/(admin)/store-payment/page.tsx` because it intentionally handles protected endpoint responses and blocks `rawUrl`.

## Risk

Risk level: low.

This is a CI/static gate only. It does not change runtime behavior, database schema, migrations, deployment logic, or business data.

## Validation

- `node --check scripts/ci/check-unsafe-attachment-refs.mjs`
- `node scripts/ci/check-unsafe-attachment-refs.mjs`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`

## Result

Pending local validation.

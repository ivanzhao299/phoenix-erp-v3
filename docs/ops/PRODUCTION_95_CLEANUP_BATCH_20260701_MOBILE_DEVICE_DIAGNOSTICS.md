# Production 95 Cleanup Batch - Mobile Device Diagnostics

Date: 2026-07-01

## Scope

This batch addresses the mobile device monitor issue where users could still see no device data without a clear debugging reason.

## Root Cause

The mobile device page already had a backend diagnostic endpoint, but the page-level experience still had weak failure visibility:

- token reading was duplicated inside the page instead of using the shared mobile auth helper;
- all-summary and sync-health endpoint status were not shown together;
- diagnostic requests could appear stuck when an upstream/device chain was slow;
- users had no easy way to copy a diagnostic snapshot for support.

Unauthenticated production checks correctly return 401 for:

- `GET /api/v3/iot/devices/all-summary`
- `GET /api/v3/iot/devices/sync-health`

So this batch does not weaken RBAC. It improves the authenticated mobile UX and diagnostics.

## Changes

Changed files:

- `apps/web/src/app/(mobile)/mobile/device/page.tsx`
- `apps/web/src/locales/zh.json`
- `apps/web/src/locales/en.json`
- `apps/web/src/locales/lo.json`

## Implementation

- Reused shared `getMobileToken()` for mobile device API calls.
- Added 10 second timeout protection for device data and diagnostic API calls.
- Added visible endpoint diagnostics for:
  - `all-summary`
  - `sync-health`
- Added sensor count and latest collect time display in the diagnostic card.
- Added copy-diagnostics action so support can receive a structured snapshot.
- Kept unauthenticated and unauthorized paths fail-closed.
- Added zh/en/lo i18n keys for the new diagnostic states.

## Validation

- Web typecheck: PASS
- i18n key gate: PASS
- Production unauth all-summary: HTTP 401
- Production unauth sync-health: HTTP 401

## Boundaries

- Business code changed: frontend mobile diagnostics only.
- API code changed: no.
- DB write: no.
- Migration: no.
- Deploy: via CI/CD after push only.
- Push: pending after local validation.

## Conclusion

GO WITH CONDITIONS.

The mobile page will now show explicit diagnostic status instead of silently presenting an empty device page. If authenticated users still have no device values, the visible diagnostic card should identify whether the issue is mapping, snapshots, stale sensor data, gateway/vendor connectivity, or permissions.

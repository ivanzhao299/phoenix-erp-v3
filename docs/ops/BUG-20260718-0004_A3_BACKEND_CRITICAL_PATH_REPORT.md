# BUG-20260718-0004 A3 Backend Critical Path Report

## Scope

- Bug: `BUG-20260718-0004`
- Symptom: a farm manager could open the mobile henhouse creation form but the API could not derive the farm ownership.
- Conclusion: `PASS WITH CONDITIONS`

## Root Cause

The original route selected only A4, but the frontend already enforced the expected role and did not submit a caller-controlled farm. The failure belonged to the backend ownership derivation. The create service depended on legacy singular `farmCode` / `siteCode` and on an existing sibling house. This could reject a valid manager whose authoritative DataScope was provided through `farmCodes` / `siteCodes`, and it made the first house impossible to create without a pre-existing house.

## Changed Files

- `apps/api/src/modules/farm/farm-feed.service.ts`
- `apps/api/src/modules/farm/farm-feed.service.spec.ts`
- `docs/ops/BUG-20260718-0004_A3_BACKEND_CRITICAL_PATH_REPORT.md`

## Fix

- Derive ownership from the authoritative DataScope arrays, with legacy singular values as fallback.
- Allow a first house to use one unambiguous farm/site/company scope.
- Reuse a sibling house mapping when one exists.
- Reject mobile creation when multiple farms, sites, or companies are in scope; PC must then make the ownership choice explicitly.
- Keep farm/company fields server-controlled and preserve the no-cross-scope invariant.

## Verification

- Focused Jest coverage exercises first-house creation, sibling ownership reuse, and multi-farm fail-closed behavior.
- API typecheck is required before release.
- No migration, schema change, seed, DB operation, deployment, or production write was performed by this implementation.

## Remaining Gate

The technical fix requires CI/CD deployment and a mobile business UAT using the affected farm-manager account before the report may be marked business verified.

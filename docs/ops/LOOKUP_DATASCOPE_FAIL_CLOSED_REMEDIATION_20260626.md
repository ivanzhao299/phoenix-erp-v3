# Lookup DataScope Fail-Closed Remediation - 2026-06-26

## Scope

This remediation tightens high-frequency lookup endpoints used by procurement, finance, inventory, breeding, and shared business entry pages.

Changed file:

- `apps/api/src/modules/product-master/controllers/lookup.controller.ts`

## Problem

`LookupController.resolveCompanyScope()` previously returned `isGlobal=true` when CLS user context was missing or DataScope resolution failed. That made selector endpoints fail open, which could expose cross-company options during abnormal request context or DataScope errors.

The farm lookup also returned all active farms for non-global users with no company or farm scope.

## Fix

- Missing user context now returns an empty non-global scope.
- DataScope resolution errors now return an empty non-global scope.
- Farm lookup now returns an empty list for non-global users without farm or company scope.

## Expected Behavior

- Properly scoped users still see authorized companies, warehouses, farms, stores, projects, accounts, and related selectors.
- Global users still see global options.
- Abnormal or empty DataScope states return empty options instead of all options.

## Risk

Risk level: Medium-low.

This is a permission tightening change. Users with incomplete DataScope setup may see fewer selector options, which is the correct fail-closed behavior and should be handled by role/data readiness instead of broad fallback.

## Verification

Required:

- API typecheck
- Web typecheck
- W5 closeout gate
- CI/CD after push
- Production health smoke after deploy

## Business Code / Migration / Deploy

- Business logic changed: yes, backend selector permission behavior only.
- Migration executed: no.
- Schema changed: no.
- DB write: no.
- Deployment: via normal CI/CD after validation.


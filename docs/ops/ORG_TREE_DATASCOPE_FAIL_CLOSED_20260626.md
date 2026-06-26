# Organization Tree DataScope Fail-Closed Remediation

Date: 2026-06-26
Commit scope: P0/P1 RBAC / DataScope hardening

## Problem

`OrgService.resolveOrgCompanyScope()` previously returned `ALL` when company scope could not be resolved for a logged-in user. That meant `/api/org/organizations` and `/api/organizations/tree` could return the full organization tree during abnormal DataScope resolution.

## Fix

Updated `apps/api/src/modules/org/services/org.service.ts` so organization tree scope now fails closed for logged-in users when:

- the user context exists but no reliable user id is available;
- `DataScopeService.resolve()` throws or cannot resolve company scope.

Internal calls without a user context are still treated as unrestricted, and explicitly global scopes still return the full tree.

## Affected Runtime Paths

- `GET /api/org/organizations`
- `GET /api/organizations/tree`
- `GET /api/organizations`
- `GET /api/organizations/by-type`

## Security Result

Organization visibility is now aligned with the same fail-closed rule used for company-scoped master data selectors. A user with broken or missing scope receives an empty organization tree instead of cross-company organization data.

## Deployment Notes

No DB migration, no seed, no production data write. This is backend authorization behavior only.


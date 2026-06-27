# Master Data Runtime DataScope Fail-Closed Remediation

Date: 2026-06-26
Commit scope: P0/P1 RBAC / DataScope hardening

## Problem

`MasterDataRuntimeService.allowedCompanies()` previously returned `ALL` when DataScope resolution failed for a logged-in user. For company-scoped master data, that made selector/runtime endpoints fail open and could expose cross-company customer, project, store, cash-account, bank-account, or other scoped master data during abnormal scope resolution.

## Fix

Updated `apps/api/src/modules/master-data/master-data-runtime.service.ts` so that company-scoped master data now fails closed for logged-in users when:

- the user context exists but no reliable `userId` can be resolved;
- `DataScopeService.resolve()` throws or cannot resolve company scope.

The service still returns `ALL` only for:

- master data types without a `companyCol` because they are global/shared by design;
- internal calls without a user context;
- users whose DataScope explicitly resolves to global scope.

## Affected Runtime Paths

- `GET /api/master-data/runtime/:type`
- `GET /api/master-data/runtime/:type/active`
- `GET /api/master-data/runtime/:type/:code`
- write/transition paths that internally call scoped `get()`

## Security Result

- Company-scoped master data no longer expands to all companies when DataScope resolution fails.
- Normal global/admin access is preserved when DataScope explicitly resolves as global.
- Internal background/governance calls without user context are not narrowed.

## Business Impact

If a user lacks any company scope or has a malformed token context, company-scoped selector lists now return empty / record lookups are hidden instead of showing all records. This aligns with the global requirement that users must not see unauthorized menu/data fragments.

## Verification

Planned validation:

- API TypeScript check
- Web TypeScript check
- `git diff --check`
- W5 closeout gate

## Deployment Notes

No DB migration, no seed, no production data write. This is backend authorization behavior only.

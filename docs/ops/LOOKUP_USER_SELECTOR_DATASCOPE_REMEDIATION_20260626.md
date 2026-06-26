# Lookup User Selector DataScope Remediation - 2026-06-26

## Scope

This remediation tightens the shared user lookup used by operator, receiver, handler, and other high-frequency business forms.

Changed files:

- `apps/api/src/modules/product-master/controllers/lookup.controller.ts`
- `apps/web/src/components/shared-selectors/MasterDataSelectors.tsx`

## Problem

`/api/lookup/users` previously returned all active users when `storeCode` was not provided. The shared frontend `UserSelector` called this endpoint without a store filter and then applied a browser-side store filter as a fallback.

That meant the server still exposed a broader user list than required, and any caller that skipped or disabled frontend filtering could see cross-store or cross-company users.

## Fix

Backend:

- `/api/lookup/users` now resolves DataScope and fails closed for non-global users with no company/site scope.
- Global users can still retrieve all active users.
- Non-global users are filtered by `allowedSiteCodes`, `allowedCompanyCodes`, and `sys_user_orgs` membership.
- If `storeCode` is provided, it is still enforced, then intersected with the current user's DataScope.

Frontend:

- Shared `UserSelector` now sends current `storeCode` to `/lookup/users` by default.
- Existing client-side filtering remains as a secondary safety net.

## Expected Behavior

- Ordinary business users only see users in their authorized store/site/company scope.
- Admin/global users retain global lookup behavior.
- Missing or broken DataScope returns no users instead of all users.

## Risk

Risk level: Medium.

This is a permission tightening change. If a business form loses expected user options, the fix should be to correct the target user's `sys_user_orgs` or site/company mapping, not to reopen global lookup.

## Verification

Required:

- API typecheck
- Web typecheck
- W5 closeout gate
- CI/CD after push
- Production health smoke after deploy

## Business Code / Migration / Deploy

- Business logic changed: yes, user selector permission behavior.
- Migration executed: no.
- Schema changed: no.
- DB write: no.
- Deployment: via normal CI/CD after validation.


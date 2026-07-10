# BUGTASK-20260707-0001 A4 Frontend UIUX UAT Report

## Result

PASS WITH CONDITIONS

Do not mark BUG-20260707-0001 resolved until CI/CD, production smoke, and business acceptance confirm the deployed behavior.

## Source

- Source bug: BUG-20260707-0001
- Source repair task: BUGTASK-20260707-0001
- Route: `/finance2/cash-accounts`
- Acceptance: role without account filing create permission should be told `当前角色无权限新建账户` when trying to create a cash account.

## Diagnosis

The finance cash accounts page still used `MENU_FIN2_CASH_MASTER:C` as the create-account UI gate. A backend repair report in this worktree records that `POST /api/v2/finance/cash/accounts` now requires `MENU_MD_CASH_ACCOUNT:C` and returns `当前角色无权限新建账户` when denied.

Root cause: frontend create visibility was still aligned to the old finance cash master permission instead of the account filing permission used by the backend create endpoint.

## Changed Files

- `apps/web/src/app/(admin)/finance2/cash-accounts/page.tsx`
  - Uses `MENU_MD_CASH_ACCOUNT:C` as the real create authority.
  - Keeps the legacy `MENU_FIN2_CASH_MASTER:C` button visible for the observed stale/legacy permission state, but clicking it now shows `当前角色无权限新建账户` instead of opening the create modal.
  - Leaves cash transaction create/edit/delete and account edit/recompute gates unchanged.
- `apps/web/src/lib/finance-cash-account-permissions.ts`
  - Adds explicit permission constants and create button state logic.
- `apps/web/src/lib/finance-cash-account-permissions.test.ts`
  - Adds focused regression coverage for allowed, denied legacy, and hidden states.

## Verification

- PASS: `pnpm --filter web test -- src/lib/finance-cash-account-permissions.test.ts`
  - 4 tests passed.
- PASS: `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- PASS: `git diff --check -- apps/web/src/lib/finance-cash-account-permissions.ts apps/web/src/lib/finance-cash-account-permissions.test.ts 'apps/web/src/app/(admin)/finance2/cash-accounts/page.tsx'`

## Desktop And Mobile Check

Live desktop/mobile route smoke is the condition on this PASS.

Attempted local route verification:

- `pnpm --filter web dev`
  - Failed: `listen EPERM: operation not permitted 0.0.0.0:3000`
- `./node_modules/.bin/next dev -H 127.0.0.1 -p 3001`
  - Failed: `listen EPERM: operation not permitted 127.0.0.1:3001`
- Existing local server checks on `127.0.0.1:3000` and `127.0.0.1:3001`
  - No server was available.

Code-level responsive review:

- The changed action remains inside the existing `PageHeader` flex action area and uses the existing `primaryActionButton` token.
- No account list, empty, loading, drawer, modal layout, or mobile-specific styling was changed.
- The create modal still only opens for users with `MENU_MD_CASH_ACCOUNT:C`.

## RBAC And State Preservation

- RBAC preserved:
  - Account creation now follows `MENU_MD_CASH_ACCOUNT:C`.
  - Account edit/recompute remains on `MENU_FIN2_CASH_MASTER:E`.
  - Manual cash transaction permissions remain on `MENU_FIN2_CASH_TXN`.
- DataScope, audit, attachment ACL, API paths, and request bodies were not changed.
- Empty and loading states were not changed.
- Backend denial remains preserved in `CreateAccountModal` submit error handling for stale/race cases.

## Conditions

- CI must run the full web pipeline.
- A live desktop and mobile smoke must verify `/finance2/cash-accounts` with:
  - a user with legacy `MENU_FIN2_CASH_MASTER:C` but without `MENU_MD_CASH_ACCOUNT:C`: button click shows `当前角色无权限新建账户` and no create modal opens;
  - a user with `MENU_MD_CASH_ACCOUNT:C`: button opens the create modal;
  - a user without either create permission: no create affordance is shown.
- Production smoke and business acceptance are still required.

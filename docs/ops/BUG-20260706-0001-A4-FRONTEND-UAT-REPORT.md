# BUG-20260706-0001 A4 Frontend UAT Report

## 1. Changed Files

- `apps/web/src/app/(admin)/finance2/cash-accounts/page.tsx`
- `docs/ops/BUG-20260706-0001-A4-FRONTEND-UAT-REPORT.md`

## 2. Page / Component List

- Route: `/finance2/cash-accounts`
- Component: `CashAccountsPage`
- Modal: `CreateAccountModal`
- Affected action: `POST /api/v2/finance/cash/accounts`

## 3. UI/UX Adjustment Summary

- Adjusted the create-account submit payload so `accountCode` is always submitted as a string.
- When the account code field is left blank, the frontend now sends `accountCode: ""` instead of omitting the field.
- This preserves the current UI wording, `账户编号（留空自动生成）`, and lets the backend service path continue automatic code generation for blank values.

## 4. Permission Visibility Notes

- No permission visibility logic changed.
- Existing `MENU_FIN2_CASH_MASTER:C` gating for `新建账户` remains unchanged.
- No RBAC bypass, DataScope bypass, audit bypass, or attachment ACL change was introduced.

## 5. Responsive Behavior Notes

- No layout, style, breakpoint, modal size, or mobile behavior changed.
- The change is request-payload only and does not alter visible UI structure.

## 6. UAT Smoke Result

- Result: `PASS WITH CONDITIONS`
- Static diagnosis: before the fix, blank account code omitted `accountCode` from JSON; after the fix, blank account code submits `accountCode` as an empty string.
- Expected behavior: the backend receives a text value and can enter the existing automatic account-code generation branch instead of failing type validation with `「accountCode」必须是文本`.
- Browser UAT was not executed because this worktree currently has no `node_modules`; local Next.js dev server and `tsc` binary are unavailable.

## 7. A2 Security Review Required

- Required: `No`
- Reason: no permission, token, RBAC, DataScope, audit, ACL, or route exposure behavior changed.

## 8. A1 Validation Required

- Required: `Yes`
- Reason: final CI/runtime gate should run in an environment with dependencies installed and an API available.

## 9. Validation Commands

- `pwd` -> passed, worktree path is `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke`
- `git branch --show-current` -> passed, branch is `w5-a4-frontend-uat-smoke`
- `git status --short` -> initially clean
- `git log --oneline --decorate -8` -> inspected
- `cd apps/web && ./node_modules/.bin/tsc --noEmit` -> not runnable, `./node_modules/.bin/tsc` missing
- `git diff --check` -> passed
- `git add apps/web/src/app/(admin)/finance2/cash-accounts/page.tsx docs/ops/BUG-20260706-0001-A4-FRONTEND-UAT-REPORT.md` -> blocked by sandbox: unable to create `/Users/mac/phoenix-erp/.git/worktrees/a4-frontend-uat-smoke/index.lock`

## 10. Blockers And Next Recommendation

- Blocker: dependencies are not installed in this worktree, so local typecheck and browser smoke cannot be completed here.
- Blocker: commit could not be created from this sandbox because the linked worktree Git index is outside the writable root.
- Next recommendation: A1 should run frontend typecheck and route smoke in a prepared environment. If the API still rejects `accountCode: ""`, the remaining defect is backend DTO/service behavior and should be handled by A3.

## Final Status

`PASS WITH CONDITIONS`

# BUG-20260707-0010 A4 Frontend UAT Report

## Result

PASS WITH CONDITIONS

## Changed File List

- `apps/web/src/app/(admin)/workflow/todos/page.tsx`
- `docs/ops/BUG-20260707-0010-a4-frontend-uat-report.md`

## Page / Component List

- Route: `/workflow/todos`
- Page: `ApprovalTodosPage`
- Components touched by usage only:
  - `PageHeader`
  - `RightDrawer`
  - `WorkflowFormRenderer`

## UI/UX Adjustment Summary

- Fixed the header count display for approval todos.
- The page previously rendered rows from `resp.items` but showed the header count from `resp.total` only.
- Added `getDisplayTotal()` so the visible count never drops below the number of tasks already loaded from the same API response.
- Reused the normalized count for pagination labels and next-page disabled state.
- Removed one unused import and tightened form renderer casts to keep the target page lint-clean.

## Permission Visibility Notes

- No RBAC, permission code, DataScope filter, token handling, or API path was changed.
- The fix only normalizes already-authorized frontend response data.
- Approval, reject, transfer, and candidate loading logic still call the original backend endpoints.

## Responsive Behavior Notes

- No layout structure, table columns, drawer widths, or responsive breakpoints were changed.
- Header subtitle now uses the normalized count value with the same existing text container.

## UAT Smoke Result

- `pwd`: `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke`
- Branch: `w5-a4-frontend-uat-smoke`
- Initial worktree: clean
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS
- `pnpm --filter web exec eslint 'src/app/(admin)/workflow/todos/page.tsx'`: PASS
- Count normalization dry-run: `items=1,total=0,page=1,pageSize=20 => displayTotal=1`
- Commit: BLOCKED by sandbox Git metadata permissions.
  - `git add ...`: FAIL, `Unable to create '/Users/mac/phoenix-erp/.git/worktrees/a4-frontend-uat-smoke/index.lock': Operation not permitted`
- Local browser smoke: BLOCKED by sandbox port binding.
  - `pnpm dev:web`: FAIL, `listen EPERM 0.0.0.0:3000`
  - `next dev -H 127.0.0.1 -p 3001`: FAIL, `listen EPERM 127.0.0.1:3001`

## A2 Security Review Required

Recommended, because `/workflow/todos` is RBAC/DataScope-sensitive. This A4 change does not alter authorization, but A2 should confirm that using already-returned `items.length` as a display fallback does not conflict with security reporting expectations.

## A1 Validation Required

Required for CI/runtime gate and browser-backed UAT in an environment where the web server and API can run.

## Blockers And Next Recommendation

- Backend dependency: if `/api/workflow/my-tasks` returns `total=0` while more than one page of authorized todos exists, frontend cannot know the true full total without a correct backend total. A3 should verify the endpoint total aggregation.
- Local environment blocker: this sandbox rejects local port binding, so no Playwright/browser smoke could be completed here.
- Local Git blocker: this sandbox can write the worktree files but cannot write the linked Git metadata under `/Users/mac/phoenix-erp/.git/worktrees/a4-frontend-uat-smoke`, so commit could not be created here.
- Recommendation: GO for the frontend display fix with A1/A3 follow-up validation before release.

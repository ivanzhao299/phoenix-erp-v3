# BUG-20260727-0002 A4 Frontend UAT Smoke Report

## Conclusion

PASS WITH CONDITIONS

This is not a production-resolution claim. CI/CD, production semantic smoke, and business acceptance remain mandatory.

## Source

- Bug: `BUG-20260727-0002`
- Repair task: `BUGTASK-20260727-0002`
- Route: `/workflow/todos`
- Issue: the “我的待办” header count displayed `0` while pending task rows were visible.
- Acceptance: the header count follows the actual pending tasks and must not show “共 0 条” when tasks are present.

## Diagnosis and Existing Repair

The current baseline already contains the frontend-owned repair:

- `apps/web/src/app/(admin)/workflow/todos/page.tsx` derives both the header count and pagination from `getWorkflowTodoDisplayTotal(resp)`, rather than rendering `resp.total` directly.
- `apps/web/src/lib/workflow-todos.ts` treats the API total as metadata, calculates the minimum count proven by the currently loaded page, and returns the greater value. A stale API response such as `items: [todo1, todo2, todo3], total: 0` therefore renders `3`, not `0`.
- Empty data remains `0`; loading and empty-state branches are unchanged.
- The route remains under the existing admin layout and `MENU_WORKFLOW_TODO` navigation permission. No RBAC, DataScope, audit, attachment ACL, API, schema, migration, or database behavior was changed.

Root cause: unified task rows and aggregate `total` metadata can become inconsistent. Rendering the stale aggregate directly made the title contradict the visible list.

## Changed Files

- `apps/web/src/lib/workflow-todos.test.ts`
  - Added focused coverage for `BUG-20260727-0002` with three visible tasks and stale `total: 0`.
- `docs/ops/BUG-20260727-0002_A4_FRONTEND_UAT_SMOKE_REPORT.md`
  - Records diagnosis, ownership, verification, conditions, and the canonical conclusion.

The existing repair files verified without modification are:

- `apps/web/src/app/(admin)/workflow/todos/page.tsx`
- `apps/web/src/lib/workflow-todos.ts`

## Verification

- `cd apps/web && ./node_modules/.bin/vitest run src/lib/workflow-todos.test.ts`
  - PASS: 1 file, 7 tests.
  - Covers positive API totals, stale numeric/string totals, three visible mixed-source tasks with `total: 0`, later pages, and empty/malformed responses.
- `cd apps/web && ./node_modules/.bin/eslint 'src/app/(admin)/workflow/todos/page.tsx' src/lib/workflow-todos.ts src/lib/workflow-todos.test.ts`
  - PASS: no findings.
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - PASS: no TypeScript errors.
- `cd apps/web && ./node_modules/.bin/next build --webpack --experimental-build-mode compile --debug-build-paths 'src/app/(admin)/workflow/todos/page.tsx'`
  - PASS: compiled successfully.
  - Existing warnings remained for `outputFileTracingRoot` versus `turbopack.root`, custom cache-control headers, and the deprecated middleware convention.
- `git diff --check`
  - PASS.
- Permission/static state inspection:
  - PASS: `/workflow/todos` remains registered with `MENU_WORKFLOW_TODO` in `Sidebar.tsx`; the admin layout redirects users who lack the registered menu permission.
  - PASS: the page's loading and empty-state branches remain intact; this task did not alter fetch/auth, approval actions, RBAC, or DataScope.

## Desktop and Mobile Behavior

- Desktop source/layout check: PASS. The shared `PageHeader` renders the computed count beside the title, and the task table/pagination use the same `displayTotal`.
- Mobile source/layout check completed. `PageHeader` uses a wrapping flex row, so the count subtitle can wrap without changing or truncating its value; the filter bar also wraps. The task made no responsive CSS changes.
- Real browser viewport verification was attempted but could not run because the Codex sandbox rejected local Next.js startup with `listen EPERM: operation not permitted 127.0.0.1:3000`. No production URL was opened because the contract forbids deployment/production actions and requires runner smoke.

## Conditions

- CI/CD must pass.
- Authenticated desktop and mobile browser smoke could not be captured locally because the sandbox blocked the dev-server listener.
- The runner must perform authenticated production semantic smoke on `/workflow/todos` with a user who has pending tasks.
- Business acceptance by the reporter is required before the bug is declared resolved.

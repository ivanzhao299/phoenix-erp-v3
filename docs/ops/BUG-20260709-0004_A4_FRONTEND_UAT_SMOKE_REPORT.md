# BUG-20260709-0004 A4 Frontend UAT Smoke Report

## Source

- Source bug: `BUG-20260709-0004`
- Source repair task: `BUGTASK-20260709-0004`
- Assigned agent: `A4-Frontend-UAT-Smoke`
- Route: `/workflow/todos`
- Reported symptom: `审批中心 / 我的待办` showed one visible pending approval row while the page header said `我的待审批任务（共 0 条）`.

## Diagnosis

The affected route renders the header count from `displayTotal` in `apps/web/src/app/(admin)/workflow/todos/page.tsx`. `displayTotal` is calculated by `getWorkflowTodoDisplayTotal(resp)`, which takes the larger value of:

- API-provided `total`;
- the minimum count proven by the currently rendered page: `(page - 1) * pageSize + items.length`.

That frontend behavior prevents the exact screenshot failure mode where `items.length === 1` but stale API metadata says `total === 0`. The current route also keeps loading and empty states keyed to `resp.items.length`, so a visible row is not replaced by the empty state.

This A4 pass found the production code path already aligned by prior committed frontend work and added one additional focused regression case for serialized stale metadata (`total: "0"`), which is a realistic API/client boundary shape.

## Changed Files

- `apps/web/src/lib/workflow-todos.test.ts`
  - Added a BUG-20260709-0004 regression case where visible ApprovalEngine rows are returned with serialized stale count metadata.
- `docs/ops/BUG-20260709-0004_A4_FRONTEND_UAT_SMOKE_REPORT.md`
  - Added this task-specific evidence report.

No `apps/api/**`, migrations, schema, entity, table, column, database write, deploy, push, or task-board update was performed.

## Frontend Behavior Evidence

- Header count source: `apps/web/src/app/(admin)/workflow/todos/page.tsx` uses `displayTotal = getWorkflowTodoDisplayTotal(resp)` and renders that value in the `PageHeader` subtitle.
- Regression target: `apps/web/src/lib/workflow-todos.ts` returns at least the number of loaded rows when API `total` is stale.
- Desktop route path: `/workflow/todos` uses the same `PageHeader` count path at desktop widths; no layout or global CSS was changed.
- Mobile check: no mobile route was modified. `/mobile/workflow` already uses `todos.length` for the tab badge/list count, so this desktop route repair does not alter mobile permissions, loading, empty, or action behavior.

## Permission, Scope, And States

- RBAC/DataScope: preserved. The page still calls `/api/workflow/my-tasks` with the existing Authorization header and does not bypass backend-scoped results.
- Permission visibility: preserved. No sidebar, auth context, menu, or permission helper code was changed.
- Loading state: preserved. The page still shows `加载中…` while `loading` is true.
- Empty state: preserved. The page still shows `暂无待审批任务` only when `resp.items.length === 0`.
- Error handling: preserved. The existing fetch fallback still returns an empty list for non-OK responses; approval/reject/reassign toast behavior was not changed.
- Attachment ACL: not touched. This route repair does not read or render attachment files.

## Validation Commands

- `cd apps/web && ./node_modules/.bin/vitest run src/lib/workflow-todos.test.ts`
  - PASS: 1 test file passed, 6 tests passed.
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 TypeScript errors.
- `cd apps/web && pnpm test src/lib/workflow-todos.test.ts`
  - BLOCKED: local `pnpm` command exits with `packages field missing or empty`; used the local Vitest binary instead.
- `cd apps/web && ./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3014`
  - BLOCKED: sandbox denied loopback listener with `listen EPERM`.
- `cd apps/web && ./node_modules/.bin/next build`
  - BLOCKED: Turbopack internal error because `apps/web/node_modules` is a symlink to another worktree outside the filesystem root.

## Result

`PASS WITH CONDITIONS`

A focused frontend regression is in place and web typecheck passes. Do not claim production resolution until CI/CD, staging or production smoke on `/workflow/todos`, and business acceptance confirm the header count matches the actually displayed pending approval rows.

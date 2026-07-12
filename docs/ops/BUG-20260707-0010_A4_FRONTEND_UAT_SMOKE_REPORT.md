# BUG-20260707-0010 A4 Frontend UAT Smoke Report

## Result

PASS WITH CONDITIONS

No production-resolution claim is made until CI/CD, production smoke on `/workflow/todos`, and business acceptance are complete.

## Source

- Source bug: `BUG-20260707-0010`
- Source task: `BUGTASK-20260707-0010`
- Route: `/workflow/todos`
- Reported issue: approval tasks are visible in "我的待办", but the top header shows `共 0 条`.

## Root Cause

The page rendered rows from `items`, while the header and pagination trusted `total`. When the frontend received a stale or narrower `total=0` with non-empty returned `items`, the UI could show approval rows while still displaying `我的待审批任务（共 0 条）`.

## Changed Files

- `apps/web/src/app/(admin)/workflow/todos/page.tsx`
- `apps/web/src/lib/workflow-todos.ts`
- `apps/web/src/lib/workflow-todos.test.ts`

## Fix

- Extracted `getWorkflowTodoDisplayTotal()` as a tested frontend helper.
- Header and pagination now use the larger of:
  - API `total`
  - minimum count proven by the current loaded page and visible rows
- For the reported shape `items.length=1,total=0,page=1,pageSize=20`, the header now displays `共 1 条`.

## State Preservation

- RBAC/menu visibility preserved: `/workflow/todos` remains gated by `MENU_WORKFLOW_TODO` in `Sidebar.tsx`; no permission logic changed.
- DataScope preserved: no request filters, auth headers, API paths, or backend behavior changed.
- Loading state preserved: existing `加载中…` branch unchanged.
- Empty state preserved: existing `暂无待审批任务` branch still depends on `resp.items.length === 0`.
- Error/toast behavior preserved: existing no-access, network, approve/reject/transfer error toasts unchanged.

## Validation

- `pnpm --filter web test -- src/lib/workflow-todos.test.ts`: PASS, 4 tests
- `pnpm --filter web exec eslint 'src/app/(admin)/workflow/todos/page.tsx' src/lib/workflow-todos.ts src/lib/workflow-todos.test.ts`: PASS
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS

## Desktop And Mobile Check

- Desktop route behavior checked at code level against the captured 1600px scenario: the header subtitle source is now `displayTotal`, and table/loading/empty/error branches are unchanged.
- Mobile-sized behavior checked at code level: no CSS, breakpoint, layout, or touch-control behavior was modified; only the numeric count source changed.
- Local live browser smoke could not be run because Next dev server binding failed in this sandbox:
  - `pnpm dev:web`: `listen EPERM: operation not permitted 0.0.0.0:3000`
  - `next dev --hostname 127.0.0.1 --port 3001`: `listen EPERM: operation not permitted 127.0.0.1:3001`

## Conditions

- Run CI/CD before production closure.
- Run production desktop and mobile smoke on `/workflow/todos` with a user who has at least one real ApprovalEngine pending task.
- Business owner must confirm the displayed count matches the actual pending task quantity.

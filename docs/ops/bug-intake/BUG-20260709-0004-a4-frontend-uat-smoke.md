# BUG-20260709-0004 A4 Frontend UAT Smoke Report

## Source

- Bug: `BUG-20260709-0004`
- Task: `BUGTASK-20260709-0004`
- Route: `/workflow/todos`
- Agent: `A4-Frontend-UAT-Smoke`

## Symptom

审批中心 / 我的待办页面实际展示 1 条未审批记录，但标题副文案显示“我的待审批任务（共 0 条）”。

## Diagnosis

The page renders rows from `/api/workflow/my-tasks` `items`, while the header count previously depended on the API `total`. When `total` is stale or under-counted but `items` contains visible approval tasks, the UI can contradict itself.

Current frontend code uses `getWorkflowTodoDisplayTotal(resp)` in `apps/web/src/app/(admin)/workflow/todos/page.tsx`, taking the larger value between API `total` and the minimum count implied by loaded rows and pagination. This preserves normal totals while preventing a visible non-empty table from showing `0`.

## Changed Files

- `apps/web/src/lib/workflow-todos.ts`
  - Documents the display-count floor that keeps the header aligned with already rendered todo rows when API `total` is stale.
- `apps/web/src/lib/workflow-todos.test.ts`
  - Added a task-specific regression case for `BUG-20260709-0004`: one visible approval-engine todo with `total: 0` must display count `1`.

No backend, migration, schema, entity, table, column, database, deploy, or task-board changes were made.

## Frontend Behavior Evidence

- Desktop affected page logic:
  - `/workflow/todos` header uses `displayTotal`.
  - Table empty/loading branches still use `resp.items.length`, so loading and empty states are unchanged.
  - Permission visibility remains owned by existing route/sidebar RBAC and API response filtering; no permission gates were changed.
- Mobile behavior:
  - The desktop route `/workflow/todos` was the reported route. No mobile workflow file was changed.
  - The helper is pure display-count logic and does not alter mobile route state or permissions.
- Error handling:
  - Existing `fetchTodos` non-OK fallback remains `{ items: [], total: 0, page: 1, pageSize: 20 }`.
  - Existing loading, empty, approval drawer, approve/reject/transfer flows remain unchanged.

## Validation Commands

- `cd apps/web && ./node_modules/.bin/vitest run src/lib/workflow-todos.test.ts`
  - PASS: 1 file, 5 tests.
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 TypeScript errors.
- `cd apps/web && ./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3014`
  - BLOCKED by local sandbox: `listen EPERM: operation not permitted 127.0.0.1:3014`.
  - Because the dev server could not bind a local port, Playwright desktop/mobile visual smoke could not be completed in this agent environment.

## Result

PASS WITH CONDITIONS

Conditions:

- This is a frontend display repair only. It prevents the affected page from showing `0` when rows are visibly loaded.
- Browser-level desktop/mobile smoke remains pending because local port binding is blocked in the current sandbox.
- Final resolved status still requires CI/CD, production smoke on `https://erp.eggslao.com/workflow/todos`, and business acceptance with the reporter account.

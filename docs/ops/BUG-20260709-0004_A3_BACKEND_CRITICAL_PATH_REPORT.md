# BUG-20260709-0004 A3 Backend Critical Path Report

## Source

- Source bug: `BUG-20260709-0004`
- Source repair task: `BUGTASK-20260709-0004`
- Route: `/workflow/todos`
- Reported symptom: Approval center "我的待办" displayed one pending approval row, but the header showed `共 0 条`.

## Diagnosis

The visible row in the captured evidence is an ApprovalEngine todo (`审批引擎`, `采购申请`, `PR2-20260707-00002`). The backend count contract for `GET /api/workflow/my-tasks` is therefore that `total` must be computed from the same authorized, filtered unified todo set that produces `items`.

Current backend implementation in `WorkflowService.listMyTasks()` satisfies that contract:

- builds one unified query across WorkflowEngine and ApprovalEngine todos;
- applies ApprovalEngine RBAC and DataScope predicates before rows are returned;
- maps the returned rows into the response shape;
- applies `bizType` and `keyword` filters before computing `total`;
- returns `total = all.length` from the same filtered list used for `items`.

The backend-owned gap was the legacy `GET /api/workflow/tasks/todo` path. It already returned the same unified WorkflowEngine + ApprovalEngine visible rows, but `WorkflowService.listTodo()` reported `total = rows.length` after pagination instead of using the same unified count helper used by task summary. That let the legacy count contract drift from the real authorized todo set whenever a caller relied on backend total metadata.

Root cause: unified todo rows and legacy todo count were computed from different scopes. Rows came from `listUnifiedTodoTasks(...)`; total came from the current page length instead of `countUnifiedTodoTasks(...)`.

## Changed Files

- `apps/api/src/modules/workflow/workflow.service.ts`
  - Changed `listTodo()` to return `countUnifiedTodoTasks(user)` as `total` while still returning paginated rows from `listUnifiedTodoTasks(...)`.
- `apps/api/src/modules/workflow/workflow.service.spec.ts`
  - Added focused regression coverage for the legacy todo endpoint.
  - The test captures a visible ApprovalEngine row and asserts `total` comes from unified count, not the current page length.

No schema, entity, migration, table, column, seed, DataScope service, RBAC guard, or frontend file was changed.

## Validation

- `cd apps/api && pnpm test -- workflow.service.spec.ts`
  - PASS: 1 test suite passed, 6 tests passed.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 TypeScript errors.

## Safety

- No database writes.
- No migration execution.
- No deploy.
- No push.
- No task board modification.
- No production smoke was performed.

## Result

`PASS WITH CONDITIONS`

Backend regression coverage is in place and API typecheck passes. Do not claim production resolution until CI/CD, production smoke on `/workflow/todos`, and business acceptance confirm the header count matches real pending approval rows.

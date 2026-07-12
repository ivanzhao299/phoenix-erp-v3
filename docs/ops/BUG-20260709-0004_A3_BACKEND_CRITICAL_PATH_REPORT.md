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

Root cause of the reported production symptom is a stale/narrower total source drifting from the visible row source. This backend path now has a task-specific regression guard to prevent returning visible ApprovalEngine items with `total = 0`.

## Changed Files

- `apps/api/src/modules/workflow/workflow.service.spec.ts`
  - Added focused regression coverage for `BUG-20260709-0004`.
  - The test captures the reported ApprovalEngine row shape and asserts `items.length = 1`, `total = 1`, and `total >= items.length`.

No schema, entity, migration, table, column, seed, DataScope service, RBAC guard, or frontend file was changed.

## Validation

- `cd apps/api && pnpm test -- workflow.service.spec.ts --runInBand`
  - PASS: 1 test suite passed, 5 tests passed.
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

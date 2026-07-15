# BUG-20260707-0010 A3 Backend Critical Path Repair Report

## Source

- Source bug: `BUG-20260707-0010`
- Source repair task: `BUGTASK-20260707-0010`
- Assigned agent: `A3-Backend-Critical-Path`
- Route: `/workflow/todos`
- Reported symptom: approval todo rows are visible, but the header count shows `0`.

## Diagnosis

The captured row is an ApprovalEngine todo for `PR2-20260707-00002`. The backend contract for `GET /api/workflow/my-tasks` is that `total` must be counted from the same RBAC/DataScope-authorized unified todo set as `items`.

The current branch already contained the earlier backend repair that aligned the legacy `/api/workflow/tasks/todo` total with `countUnifiedTodoTasks()`. This pass found one remaining backend hardening point in `WorkflowService.listMyTasks()`: it selected the unified rows first, then applied filters and pagination in service memory. That kept the visible bug covered, but it left the count/list contract dependent on service-side post-processing and could drift again under empty out-of-range pages or large result sets.

Root cause addressed in this pass: the unified todo API did not compute filtered count and paginated rows as one database-level result shape.

## Changed Files

- `apps/api/src/modules/workflow/workflow.service.ts`
  - Moved `bizType` and `keyword` filters into the unified todo SQL.
  - Added a `filtered` CTE and `counted` CTE so `total` is the count of the same authorized, filtered set used by the paginated rows.
  - Kept the existing ApprovalEngine RBAC/admin-override predicate and DataScope predicate unchanged.
- `apps/api/src/modules/workflow/workflow.service.spec.ts`
  - Updated `listMyTasks()` mocks to match the SQL result shape with `total_count`.
  - Added regression coverage for a filtered count when the requested page returns no rows.

No schema, entity, migration, seed, frontend, deployment, database write, or task-board change was made.

## Validation

- `cd apps/api && pnpm test -- workflow.service.spec.ts`
  - PASS: 1 suite, 7 tests.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 TypeScript errors.

## Result

`PASS WITH CONDITIONS`

Backend count/list semantics are repaired and covered by focused regression tests. Do not claim the production bug is resolved until CI/CD, production smoke on `/workflow/todos`, and business acceptance confirm the displayed count matches real pending approval rows.

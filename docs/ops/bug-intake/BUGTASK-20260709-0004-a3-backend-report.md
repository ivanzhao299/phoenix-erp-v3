# BUGTASK-20260709-0004 A3 Backend Report

## Source

- Bug: BUG-20260709-0004
- Task: BUGTASK-20260709-0004
- Route: `/workflow/todos`
- Symptom: approval todo list showed one pending approval row, but the page header displayed `共 0 条`.
- Agent: A3-Backend-Critical-Path
- Date: 2026-07-15

## Diagnosis

The backend todo endpoints return both visible rows and a separate `total`. If the count path drifts from the list path, the UI can render actual rows while displaying `total = 0`.

Relevant backend entrypoints:

- `GET /api/workflow/my-tasks` via `WorkflowService.listMyTasks`
- `GET /api/workflow/tasks/todo` via `WorkflowService.listTodo`

The existing implementation already uses unified ApprovalEngine + WorkflowEngine list/count queries. The remaining backend hardening needed for this bug is to enforce the response invariant that `total` must never be lower than the current returned page's visible row lower bound.

No schema, entity, migration, seed, database write, or frontend change was required.

## Root Cause

`total` was trusted as an independent count value. A count/list mismatch can produce a response where rows are visible but `total` is `0`, which matches the captured symptom.

## Changed Files

- `apps/api/src/modules/workflow/workflow.service.ts`
  - `listTodo`: clamps `total` to at least `offset + rows.length` when the current page has visible rows.
  - `listMyTasks`: filters visible task rows first, then clamps `total` to at least `(page - 1) * pageSize + visibleRows.length` when the current page has visible rows.
- `apps/api/src/modules/workflow/workflow.service.spec.ts`
  - Added BUG-20260709-0004 regression coverage for `/api/workflow/my-tasks`.
  - Added legacy `/api/workflow/tasks/todo` regression coverage.

## Validation

- `cd apps/api && pnpm test -- workflow.service.spec.ts --runInBand`
  - PASS: 1 suite, 9 tests
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 TypeScript errors

## Guardrails

- No deployment performed.
- No push performed.
- No database writes performed.
- No migration execution performed.
- No schema/entity/table/column changes performed.
- No `apps/web/**` changes performed.

## Result

PASS WITH CONDITIONS.

The local backend fix and focused regression tests pass. Do not claim the production bug is fully resolved until CI/CD, production smoke, and business acceptance verify `/workflow/todos` against live data.

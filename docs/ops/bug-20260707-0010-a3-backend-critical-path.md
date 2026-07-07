# BUG-20260707-0010 A3 Backend Repair Report

## Result

GO

`/workflow/todos` visible task count and Operations/Home todo count now use the same backend todo sources:

- WorkflowEngine `wf_task` assigned to current user or current user roles.
- ApprovalEngine `wf_approval_instance_steps` assigned to current user, current user roles, or the existing stuck-task `ROLE_ADMIN` override rule.

This fixes the reported mismatch where an ApprovalEngine purchase approval was visible in the list while the top count and operations todo count showed `0`.

## Changed Files

- `apps/api/src/modules/workflow/workflow.service.ts`
- `docs/ops/bug-20260707-0010-a3-backend-critical-path.md`

## APIs Covered

- `GET /api/workflow/tasks/summary`
  - `data.todo` now counts unified visible todos.
  - `data.overdueTodo` now counts unified visible overdue todos.
- `GET /api/workflow/tasks/todo`
  - now returns unified visible todos for Operations/Home short list consumers.
- `GET /api/workflow/my-tasks`
  - unchanged, used as the reference behavior for visible todo semantics.

## RBAC / DataScope / Audit

- RBAC: unchanged. Existing `@RequireMenu('MENU_WORKFLOW_TODO', 'V')` guards remain in place.
- DataScope: preserved for ApprovalEngine todos via existing CLS `dataScope` company filter semantics.
- Admin override: preserved with the existing ApprovalEngine stuck-task-only `ROLE_ADMIN` override condition.
- Audit: no write action added. This is read-only query repair, so no operation audit row is created.
- Attachment ACL: not touched.

## Validation

- `cd apps/api && ./node_modules/.bin/tsc --noEmit` -> PASS

## Frozen Items Statement

No migrations, schema/entity/table/column changes, database writes, production deploy, push, frontend changes, or task-board modifications were performed.

## Blockers

None for backend compile validation.

Runtime verification against production data was not performed because the task contract forbids production database writes/deploy and no local synced screenshot/attachment evidence was available.

## Next Review Request

A4/A1 should smoke `/workflow/todos` and the Operations/Home todo badge with an account that has at least one ApprovalEngine todo. Expected: the count equals the visible unified todo list count.

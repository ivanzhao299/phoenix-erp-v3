# BUG-20260707-0010 A3 Backend Repair Report

## Result

PASS WITH CONDITIONS

This backend redispatch revalidated the existing `/workflow/todos` backend fix and added a focused regression test for the captured BUG-20260707-0010 scenario. Final closure still requires CI/CD, production smoke, and business acceptance.

## Source Bug

- Source bug: BUG-20260707-0010
- Source repair task: BUGTASK-20260707-0010
- Route: `/workflow/todos`
- Issue: `我的待办` list showed an ApprovalEngine purchase approval task, but the page header displayed `我的待审批任务（共 0 条）`.
- Local evidence: page snapshot showed `采购申请 PR2-20260707-00002 / 采购测试2 / 80 CNY` in the table while the header count was 0. The referenced screenshot attachment was not present locally.

## Root Cause

The page count depended on a backend `total` value that could diverge from the rendered unified task list. ApprovalEngine pending steps and WorkflowEngine tasks were historically counted through different paths, so an ApprovalEngine item could be present in the returned rows while the count path still reported 0.

The current backend path is `GET /api/workflow/my-tasks` -> `WorkflowRuntimeController.getMyTasks()` -> `WorkflowService.listMyTasks()`. `listMyTasks()` now builds the unified task result once, applies the same filters, then derives both `items` and `total` from that same result set.

## Changed Files

- `apps/api/src/modules/workflow/workflow.service.spec.ts`
  - Added a focused regression test: one visible ApprovalEngine purchase todo matching BUG-20260707-0010 returns `total === 1` and one item.
- `docs/ops/bug-20260707-0010-a3-backend-critical-path.md`
  - Updated this task-specific backend report with current redispatch evidence.

Runtime code was already aligned in this branch before this redispatch; no additional production code change was needed in this pass.

## Validation

- `cd apps/api && pnpm test -- workflow.service.spec.ts --runInBand` -> PASS, 1 suite, 4 tests
- `cd apps/api && ./node_modules/.bin/tsc --noEmit` -> PASS

## Guardrails

- RBAC preserved: `GET /api/workflow/my-tasks` still requires `MENU_WORKFLOW_TODO:V`.
- DataScope preserved: ApprovalEngine todo SQL still uses CLS `dataScope.allowedCompanyCodes` for non-global users.
- Audit preserved: this is read-only task listing behavior; no new writes or audit behavior were introduced.
- Attachment ACL not touched.
- No frontend edits, migrations, schema/entity/table/column changes, database writes, deploys, pushes, force operations, or task-board writes were performed.

## Conditions

Do not mark BUG-20260707-0010 fully resolved until CI/CD passes, `/workflow/todos` is smoke-tested in production or an approved staging environment with an account that has an ApprovalEngine todo, and the business reporter accepts that the header count matches the actual visible todo count.

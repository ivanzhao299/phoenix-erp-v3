# BUG-20260707-0010 A3 Backend Repair Report

## Result

GO

`/workflow/todos` 顶部“我的待审批任务（共 N 条）”来自 `GET /api/workflow/my-tasks` 的 `total`。本次将该接口从 controller 内的临时拼装逻辑收口到 `WorkflowService.listMyTasks()`，由同一份统一待办结果同时生成 `items` 与 `total`，避免审批引擎任务已显示但计数仍为 0 的口径漂移。

## Changed Files

- `apps/api/src/modules/workflow/workflow-runtime.controller.ts`
- `apps/api/src/modules/workflow/workflow.service.ts`
- `apps/api/src/modules/workflow/workflow.service.spec.ts`
- `docs/ops/bug-20260707-0010-a3-backend-critical-path.md`

## APIs Implemented / Covered

- `GET /api/workflow/my-tasks`
  - 继续聚合 WorkflowEngine `wf_task` 与 ApprovalEngine `wf_approval_instance_steps`。
  - `items` 与 `total` 现在由 `WorkflowService.listMyTasks()` 同一过滤结果产出。
  - 保留 `taskSource`、`bizType`、`keyword`、`page`、`pageSize` 查询参数。

## RBAC / DataScope / Audit Coverage

- RBAC: 保留 controller 上的 `MenuGuard` / `DataScopeGuard`，接口仍要求 `MENU_WORKFLOW_TODO:V`。
- DataScope: ApprovalEngine 待办继续使用现有 CLS `dataScope.allowedCompanyCodes` 公司过滤，非全局用户仅看授权公司或 `company_code IS NULL` 实例。
- Admin override: 保留既有“仅卡住任务进入 ROLE_ADMIN 兜底待办”的条件。
- Audit: 本次只读查询修复，无新增写入行为，不产生审计日志。
- Attachment ACL: 未涉及附件读取或写入，ACL 未改动。

## Tests Run

- `cd apps/api && pnpm test -- workflow.service.spec.ts --runInBand` -> PASS, 3 tests
- `cd apps/api && ./node_modules/.bin/tsc --noEmit` -> PASS

## Blockers

None for backend validation.

No production deploy, no production DB read/write, no migration execution. Screenshot attachment was not available locally, but the provided page snapshot already showed the mismatch: visible ApprovalEngine purchase task with header count `0`.

## Frozen-Item Statement

No migrations, schema/entity/table/column changes, database writes, production deploy, push, frontend changes, unrelated business module changes, or task-board modifications were performed.

## Next Review Request

A4/A1 should smoke `/workflow/todos` with an account that has at least one ApprovalEngine todo. Expected result: the visible list and header count use the same total.

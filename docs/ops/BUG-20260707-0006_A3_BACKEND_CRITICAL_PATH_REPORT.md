# BUG-20260707-0006 A3 Backend Critical Path Report

Task: `BUGTASK-20260707-0006`
Route: `/breeding/daily`
Branch: `w5-a3-backend-critical-path`
Agent: `A3-Backend-Critical-Path`
Date: 2026-07-08

## Result

GO.

近期日报记录读取的是 `GET /api/crud/brd_daily_logs`。该接口原样返回 `brd_daily_logs.culling_reason` 中保存的字典编码，导致页面显示 `LOW_PRODUCTION`、`AGE`、`SICKNESS`、`INJURY` 等编码。现已在后端只读响应层对 `brd_daily_logs` 的淘汰原因和死亡原因做字典标签补全，已知编码返回中文显示值，未知/手填文本保持原样。

## Changed Files

- `apps/api/src/modules/generic-crud/generic-crud.service.ts`
- `apps/api/src/modules/generic-crud/generic-crud.service.spec.ts`
- `docs/ops/BUG-20260707-0006_A3_BACKEND_CRITICAL_PATH_REPORT.md`

## APIs Implemented

- Updated existing `GET /api/crud/brd_daily_logs`.
- No new route added.
- No request contract changed.
- Response enrichment:
  - `culling_reason`: known `BRD_CULLING_REASON` codes now return Chinese labels.
  - `culling_reason_code`: additive field preserving the original stored value.
  - `mortality_reason`: known `BRD_MORTALITY_REASON` codes now return Chinese labels.
  - `mortality_reason_code`: additive field preserving the original stored value.

## RBAC, DataScope, Audit

- RBAC preserved: `GenericCrudController.checkTableAccess()` remains unchanged.
- DataScope preserved: filtering still happens before `GenericCrudService.findAll()` receives the query.
- Audit posture unchanged: no write path was changed and no audit event contract was modified.
- Attachment ACL unaffected: no attachment APIs or upload paths were touched.

## Frozen Items

- No migration created or executed.
- No schema/entity/table/column change.
- No database write.
- No production deploy.
- No push.
- No frontend file change.
- No unrelated module change.

## Validation

Commands run:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
cd apps/api && ./node_modules/.bin/jest src/modules/generic-crud/generic-crud.service.spec.ts src/modules/generic-crud/generic-crud.controller.spec.ts src/modules/farm/farm.service.spec.ts --runInBand
cd apps/api && ./node_modules/.bin/tsc --noEmit
```

Evidence:

- Preflight directory: `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`
- Preflight branch: `w5-a3-backend-critical-path`
- Preflight worktree: clean before edits
- Jest: 3 suites passed, 11 tests passed
- API TypeScript: 0 errors

## Blockers

None.

## Next Review Request

Request A4 frontend/UAT smoke to verify `/breeding/daily` recent records display Chinese淘汰原因 after the backend build is deployed to the target environment.

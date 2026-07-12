# BUG-20260708-0001 A3 Backend Critical Path Report

## Source

- Bug: `BUG-20260708-0001`
- Task: `BUGTASK-20260708-0001`
- Agent: `A3-Backend-Critical-Path`
- Route: `/warehouse/query`
- Issue: `新建入库单的界面字段跟库存查询的字段不一致`
- Acceptance target: inbound items created from inbound management must become visible through inventory query.

## Diagnosis

`/warehouse/query` reads inventory facts from `/api/inventory/batches`, which is backed by `inv_batches`.

The backend gap was in the admin inbound-management write path. A `PUT /api/crud/wms_inbound/...` update that changed `wms_inbound.status` to `COMPLETED` used the generic CRUD update directly. That marked the inbound row complete but bypassed the WMS inventory write path, so no `inv_batches` or `inv_ledger` rows were created for inventory query.

The terminal inbound path already used `WmsService.confirmInbound()`, which writes `inv_batches` and `inv_ledger`. The generic CRUD completion path needed to route through the same service instead of performing a naked status update.

## Change

- `apps/api/src/modules/generic-crud/generic-crud.module.ts`
  - Imports `WmsModule` so the generic CRUD controller can use the exported `WmsService`.
- `apps/api/src/modules/generic-crud/generic-crud.controller.ts`
  - Injects `WmsService`.
  - Detects `wms_inbound` transition to `COMPLETED`.
  - Preserves existing RBAC and warehouse row-scope checks before the transition.
  - Copies the already resolved Generic CRUD `DataScope` into CLS before calling WMS, so the canonical WMS write-scope guard still applies.
  - Persists non-status detail edits first, then calls `WmsService.confirmInbound()` with a payload derived from the inbound row.
  - Avoids generic CRUD direct status completion so inventory batches are created by the canonical WMS service path.
- `apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts`
  - Adds regression coverage that completing a `wms_inbound` row calls `WmsService.confirmInbound()` and does not call the generic update path for status completion.

No migrations, schema/entity/table/column changes, database writes, deploys, pushes, or task-board mutations were performed.

## Validation

- Focused regression:
  - Command: `cd apps/api && pnpm test -- generic-crud.controller.spec.ts --runInBand`
  - Result: PASS, `10 passed`.
- API typecheck:
  - Command: `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - Result: PASS.

## Result

PASS WITH CONDITIONS.

Backend-owned local repair and validation are complete. Do not treat the source bug as fully resolved until CI/CD passes, a staging or production smoke verifies inbound completion produces visible `/warehouse/query` inventory rows, and the business reporter accepts the workflow.

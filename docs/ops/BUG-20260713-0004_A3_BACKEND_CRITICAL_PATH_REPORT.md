# BUG-20260713-0004 A3 Backend Critical Path Report

## Source

- Source bug: `BUG-20260713-0004`
- Source repair task: `BUGTASK-20260713-0004`
- Assigned agent: `A3-Backend-Critical-Path`
- Route: `/warehouse/query`
- Acceptance target: 库存查询的仓库列不要只显示仓库代码，应能显示对应中文仓库名称。

## Diagnosis

Dry-run source review found that `/warehouse/query` is backed by `GET /api/inventory/batches`, implemented by `WmsService.getInventoryBatches()`.

Before this repair, the backend query returned `SELECT * FROM inv_batches`, so the API response only contained the inventory fact table's `warehouse_code`. The canonical warehouse master table `wms_warehouses` already has `warehouse_name` and `warehouse_name_zh`; other backend lookup code uses `COALESCE(warehouse_name_zh, warehouse_name)` as the display name. The inventory API did not project that display name, leaving the page with only warehouse codes such as `LPH_MS_EGG_FARM`.

No schema, entity, table, column, migration, seed, or database write was required.

## Root Cause

The inventory read endpoint exposed only the warehouse foreign key from `inv_batches` and did not join the warehouse master data table to return a human-readable warehouse name.

## Changed Files

- `apps/api/src/modules/wms/wms.service.ts`
  - `getInventoryBatches()` now left joins `wms_warehouses` by `warehouse_code`.
  - The response now includes `warehouse_name` and `warehouse_name_zh`, both computed as `COALESCE(w.warehouse_name_zh, w.warehouse_name, b.warehouse_code)`.
  - DataScope remains applied to `b.warehouse_code`.
  - `getInventoryBatchesSummary()` uses the same projection so recent summary rows have the same display fields.
- `apps/api/src/modules/wms/wms.service.spec.ts`
  - Added focused regression assertions that the inventory SQL projects warehouse display name and keeps the scoped predicate on `b.warehouse_code`.

## Validation

- Focused regression test:
  - Command: `cd apps/api && pnpm test -- wms.service.spec.ts --runInBand`
  - Result: PASS, `1` test suite passed, `4` tests passed.
- API typecheck:
  - Command: `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - Result: PASS, `0` TypeScript errors.

## Guardrails

- No deploy was run.
- No push was run.
- No migration was created or executed.
- No database write was run.
- No frontend files were read or modified for this task.
- RBAC and DataScope guards on `GET /api/inventory/batches` were preserved.

## Result

PASS WITH CONDITIONS

Backend now supplies warehouse Chinese display fields for the inventory query endpoint. Final business resolution still requires CI/CD, environment smoke on `/warehouse/query`, and business acceptance that the frontend renders the returned warehouse name instead of the code.

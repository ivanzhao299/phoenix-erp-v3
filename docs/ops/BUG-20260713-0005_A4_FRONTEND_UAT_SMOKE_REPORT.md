# BUG-20260713-0005 A4 Frontend UAT Smoke Report

## Result

PASS WITH CONDITIONS

No production resolution is claimed. CI/CD, production smoke, and business acceptance are still required before closing the source bug.

## Source

- Bug: `BUG-20260713-0005`
- Task: `BUGTASK-20260713-0005`
- Route: `/warehouse/zones`
- Acceptance: 库区管理中「所属仓库、库区类型、状态」显示为对应中文。

## Diagnosis

The `/warehouse/zones` table columns rendered raw values from `wms_zones`:

- `warehouse_code` showed codes such as `LPH_MS_EGG_FARM`.
- `zone_type` showed dictionary codes such as `NORMAL` / `STAGING`.
- `status` showed lifecycle codes such as `ACTIVE` / `INACTIVE`.

The create/edit drawer already used `WarehouseSelector`, `DictSelect(WMS_ZONE_TYPE)`, and Chinese status options, so the frontend-owned defect was limited to list display formatting.

## Changed Files

- `apps/web/src/app/(admin)/warehouse/zones/page.tsx`
  - Added warehouse lookup label mapping from `/api/lookup/warehouses`.
  - Rendered warehouse as `仓库中文名（编码）` when a label is available, with raw-code fallback.
  - Rendered `zone_type` using `WMS_ZONE_TYPE` dictionary labels, with local Chinese fallbacks for known codes.
  - Rendered `status` as `启用` / `停用`, with unknown-code fallback.
- `apps/web/src/lib/warehouse-zone-display.ts`
  - Added focused display formatter helpers.
- `apps/web/src/lib/warehouse-zone-display.test.ts`
  - Added regression coverage for warehouse, zone type, status, and fallback behavior.

## Permission / State Preservation

- RBAC and DataScope are preserved: the page still loads zone rows through existing `DataTable` + `crudApi.list("wms_zones")`.
- The new warehouse label lookup is read-only, silent on failure, and falls back to the existing code display.
- Empty, loading, and error states remain owned by `DataTable`; no table state handling was replaced.
- Create/edit/delete flows and attachment ACL were not changed.
- No API, migration, schema, entity, table, column, database write, deploy, push, or task-board update was performed.

## Desktop / Mobile Check

- Local dev server attempt failed due sandbox networking: `listen EPERM` on both `0.0.0.0:3004` and `127.0.0.1:3004`.
- Static responsive check completed:
  - `DataTable` still uses existing `overflow-x: auto` table wrapper for narrow screens.
  - `RightDrawer` still uses the existing mobile rule `width: 100vw` / `height: 100dvh` below `768px`.
  - This fix changes only cell text rendering and one optional lookup, not layout CSS.

## Validation

Passed:

```bash
cd apps/web && ./node_modules/.bin/eslint 'src/app/(admin)/warehouse/zones/page.tsx' src/lib/warehouse-zone-display.ts src/lib/warehouse-zone-display.test.ts
cd apps/web && ./node_modules/.bin/vitest run src/lib/warehouse-zone-display.test.ts
cd apps/web && ./node_modules/.bin/tsc --noEmit
```

Condition:

```text
cd apps/web && ./node_modules/.bin/next dev -p 3004
cd apps/web && ./node_modules/.bin/next dev -H 127.0.0.1 -p 3004
```

Both server starts failed with `listen EPERM`, so real desktop/mobile browser screenshots could not be captured in this sandbox.

## Follow-Up Gate

Run after CI/CD deployment:

- Production smoke as an authorized user on `/warehouse/zones`.
- Confirm rows show warehouse Chinese names, `WMS_ZONE_TYPE` Chinese labels, and `启用/停用`.
- Business user acceptance by the reporter or warehouse master-data owner.

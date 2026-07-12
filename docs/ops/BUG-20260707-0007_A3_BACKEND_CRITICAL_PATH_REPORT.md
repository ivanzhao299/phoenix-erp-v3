# BUG-20260707-0007 A3 Backend Critical Path Report

## Source

- Bug No: BUG-20260707-0007
- Task No: BUGTASK-20260707-0007
- Agent: A3-Backend-Critical-Path
- Route: `/warehouse/locations`
- Title: 库位管理新增库位时需要选择库区，库区管理界面没有新增库区的功能
- Redispatch date: 2026-07-12

## Diagnosis

The captured failed backend requests were `PUT /api/crud/wms_locations/undefined` with `Record not found`.

Backend dry-run found the relevant path is Generic CRUD:

- `GET /api/crud/wms_zones?status=ACTIVE&limit=500` supplies the location form zone selector.
- `PUT /api/crud/wms_locations/:id` updates or soft-deletes locations.
- `PUT /api/crud/wms_zones/:id` updates zones.

Root cause for the backend-owned failure class is the route-key contract for WMS master data. The frontend CRUD client uses the row `id` in short routes, while WMS zone/location rows must be addressed by business codes:

- `wms_locations.location_code`
- `wms_zones.zone_code`

The current source already contains the production backend alias logic in `GenericCrudService` and the controller `getPkColumn()` mapping. This redispatch added missing focused controller regression coverage for the reported failing route so the backend cannot regress to physical `id` or `undefined` routing for `wms_locations`.

## Changed Files

- `apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts`
  - Extended the Generic CRUD service mock with `findOneByColumn` and `update`.
  - Added a regression test proving `controller.update('wms_locations', 'LOC-A-01', ...)` resolves the short route through `location_code` and preserves WMS edit permission (`MENU_WMS_INOUT:E`).
- `docs/ops/BUG-20260707-0007_A3_BACKEND_CRITICAL_PATH_REPORT.md`
  - Replaced stale report content with this current redispatch report.

## Validation

- `cd apps/api && ./node_modules/.bin/jest src/modules/generic-crud/generic-crud.service.spec.ts src/modules/generic-crud/generic-crud.controller.spec.ts --runInBand`
  - PASS: 2 suites passed, 20 tests passed.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 errors.

## Guardrails

- Frontend files: inspected read-only only; no `apps/web/**` modifications.
- Migrations/schema/entity/table/column changes: none.
- Database writes/seeds/migration execution: none.
- Deploy/push/merge/task-board writes: none.
- RBAC/DataScope: existing Generic CRUD WMS permission and DataScope behavior preserved; regression uses `MENU_WMS_INOUT:E`.
- Attachment ACL: not touched.

## Result

PASS WITH CONDITIONS.

Backend evidence is in place for the WMS location short-route contract, and local API validation passed. Do not mark the business bug fully resolved until CI/CD, production smoke on `/warehouse/locations`, and business acceptance confirm that a newly added active库区 appears in the新增库位 selector.

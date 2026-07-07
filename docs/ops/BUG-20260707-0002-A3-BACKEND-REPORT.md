# BUG-20260707-0002 A3 Backend Repair Report

Date: 2026-07-07
Agent: A3-Backend-Critical-Path
Branch: w5-a3-backend-critical-path
Route: `/warehouse`
Result: GO

## Diagnosis

The captured failed requests were all `GET /api/crud/wms_*` reads from the warehouse overview:

- `/api/crud/wms_zones?limit=100&offset=0`
- `/api/crud/wms_inbound?limit=200&offset=0`
- `/api/crud/wms_outbound?limit=200&offset=0`

Generic CRUD mapped every `wms_*` table to `MENU_WMS_INOUT`, including read-only `GET` calls. A user with warehouse view permission but without in/out operation permission therefore received `403` while opening the inventory overview.

## Changed Files

- `apps/api/src/modules/generic-crud/generic-crud.controller.ts`
- `apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts`
- `docs/ops/BUG-20260707-0002-A3-BACKEND-REPORT.md`

## APIs Implemented / Changed

- `GET /api/crud/wms_*`
  - Primary required permission is now `MENU_WMS_VIEW:V`.
  - `MENU_WMS_INOUT:V` remains accepted as a read fallback for existing operation roles.
- `POST /api/crud/wms_*`
  - Still requires `MENU_WMS_INOUT:C`.
- `PUT /api/crud/wms_*`
  - Still requires `MENU_WMS_INOUT:E`.
- `DELETE /api/crud/wms_*`
  - Still requires `MENU_WMS_INOUT:D`.

## RBAC / DataScope / Audit Coverage

- RBAC: fixed only the read permission mapping for WMS generic CRUD. Write permission semantics were not relaxed.
- DataScope: no DataScope service or query-scope rewrite was made. Existing `findAll()` row-scope behavior remains unchanged.
- Audit: no write path behavior was changed; no audit pipeline changes were needed.
- Attachment ACL: not touched.

## Validation

- `cd apps/api && ./node_modules/.bin/jest src/modules/generic-crud/generic-crud.controller.spec.ts --runInBand`
  - PASS: 1 suite, 3 tests.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 errors.

## Frozen Items Statement

- No migrations created or executed.
- No schema, entity, table, or column changes.
- No database writes.
- No frontend changes.
- No deployment.
- No push.

## Blockers

None for the backend repair.

## Next Review Request

Request A2 Security Regression Gate to confirm the RBAC interpretation: warehouse overview reads should be covered by `MENU_WMS_VIEW:V`, while all generic WMS writes remain guarded by `MENU_WMS_INOUT` C/E/D.

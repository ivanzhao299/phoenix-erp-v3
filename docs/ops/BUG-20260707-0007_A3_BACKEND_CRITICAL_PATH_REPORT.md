# BUG-20260707-0007 A3 Backend Critical Path Report

## Request

- Bug No: BUG-20260707-0007
- Title: 库位管理新增库位时需要选择库区，库区管理界面没有新增库区的功能
- Agent: A3-Backend-Critical-Path
- Status: COMPLETED_MERGED

## Root Cause

The generic CRUD list response used the physical `id` column as the frontend route key for all tables. WMS zone/location screens need route keys based on business codes:

- `wms_zones.zone_code`
- `wms_locations.location_code`

When a table has a numeric `id` or no frontend-safe `id`, the UI can submit the wrong route identifier and the update/create flow appears broken.

The generic update/delete helpers also returned success even when zero rows were matched, making some bad route-key paths look like silent saves.

## Changes

- `apps/api/src/modules/generic-crud/generic-crud.service.ts`
  - Added route id aliasing for `wms_locations` and `wms_zones`.
  - `findAll()` now returns frontend route `id` as `location_code` / `zone_code` for those tables.
  - `update()` and `remove()` now use `RETURNING` and reject missing rows with `BadRequestException('Record not found')`.
- `apps/api/src/modules/generic-crud/generic-crud.service.spec.ts`
  - Added unit coverage for WMS route id aliasing.
  - Added unit coverage for update/delete row-miss handling.

## Validation

- `cd apps/api && ./node_modules/.bin/jest src/modules/generic-crud/generic-crud.service.spec.ts src/modules/generic-crud/generic-crud.controller.spec.ts --runInBand`: PASS
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`: PASS

## Safety

- Migration executed: No
- DB write executed: No
- Seed executed: No
- Deploy executed by A3: No
- Push executed by A3: No
- Backend scope: generic CRUD route-key compatibility for WMS zone/location only

## Follow-Up

- A4 should verify whether the WMS zone management UI exposes a clear "新增库区" action.
- A1 should run final CI/W5 validation after merge.
- Runner should continue queue processing after this repair is pushed.

## Conclusion

GO WITH CONDITIONS

# BUG-20260706-0002 A3 Backend Repair Report

## Source

- Source bug: `BUG-20260706-0002`
- Source repair task: `BUGTASK-20260706-0002`
- Assigned agent: `A3-Backend-Critical-Path`
- Route: `/home`
- Symptom: 运营工作台不显示今日饲料消耗、今日用水

## Diagnosis

Dry-run/static reproduction from backend source found two backend-owned gaps on the IoT cabin path used by the captured evidence:

1. Captured failed request `POST /api/farm-device/cabins/daily-report/generate` returned 404 because `FarmCabinController` did not expose that route. The existing implementation was only available on `MonDeviceController` as `POST /api/v3/iot/devices/daily-report/generate`.
2. `FarmCabinController.getAllSummary()` delegates to `MonDeviceService.getAllSummary()`. That summary calculated `feedToday` and `waterToday` only from `mon_device_property_daily_agg`; when daily aggregate rows were not present yet, it returned `null` even though realtime cumulative snapshots could contain property `2488` / `2532` feed and `2484` water values.

No frontend files were read or modified. No schema/entity/migration change was required.

## Root Cause

The legacy cabin API path had drifted behind the newer IoT V3 behavior:

- missing compatibility route for daily report generation under `/api/farm-device/cabins`;
- missing realtime snapshot fallback in the legacy cabin summary's today feed/water usage calculation.

## Changed Files

- `apps/api/src/modules/iot/farm-cabin.controller.ts`
  - Added `POST daily-report/generate`.
  - Preserved `MENU_DEVICE_MONITOR:E` RBAC.
  - Delegates to existing `MonDeviceService.generateDailyReportFromIoT()`.
- `apps/api/src/modules/iot/mon-device.service.ts`
  - Added read-only realtime cumulative snapshot fallback for `feedToday` and `waterToday` when today's daily aggregate row is absent.
- `apps/api/src/modules/iot/farm-cabin.controller.spec.ts`
  - Verifies the captured route is registered as POST, keeps edit permission, and delegates to the service.
- `apps/api/src/modules/iot/mon-device.service.spec.ts`
  - Verifies today feed/water values come from realtime cumulative snapshots when daily aggregates are absent.

## Validation

Commands run:

```bash
cd apps/api
pnpm test -- src/modules/iot/farm-cabin.controller.spec.ts src/modules/iot/mon-device.service.spec.ts src/modules/iot/iot-v3.controller.spec.ts --runInBand
./node_modules/.bin/tsc --noEmit
```

Results:

- Targeted tests: `3 passed`, `5 tests passed`.
- API typecheck: `0 errors`.

## Guardrails

- No deployment.
- No push.
- No database write.
- No migration execution.
- No schema/entity/table/column changes.
- No task board mutation.
- Scope stayed within `apps/api/**` and `docs/ops/**`.

## Status

`PASS WITH CONDITIONS`

Backend repair is implemented and locally validated. This does not claim production resolution until CI/CD, production smoke, and business acceptance confirm `/home` displays today's feed and water values in the deployed environment.

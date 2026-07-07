# BUG-20260706-0002 A3 Backend Critical Path Report

## Result

PASS WITH CONDITIONS

Backend repair is complete for the API route used by `/home` to populate farm operation KPI data. Full page confirmation remains with A4 frontend/UAT because this A3 task did not modify frontend code and did not run a browser smoke against production.

## Scope

- Source bug: `BUG-20260706-0002`
- Source task: `BUGTASK-20260706-0002`
- Route: `/home`
- Symptom: operation workbench did not show today's feed consumption and today's water usage.
- Agent: `A3-Backend-Critical-Path`

## Diagnosis

`/home` requests `/api/v3/iot/devices/all-summary` and sums `data.houses[].feedToday` plus `data.houses[].waterToday`.

The actual V3 IoT route existed, but `IotV3Controller.getAllSummary()` returned:

- `feedToday: null`
- `waterToday: null`

The older `MonDeviceService.getAllSummary()` already had the cumulative-meter daily difference algorithm, but it was not used by the route that `/home` calls.

## Changed Files

- `apps/api/src/modules/iot/iot-v3.controller.ts`
- `docs/ops/BUG-20260706-0002_A3_BACKEND_CRITICAL_PATH_REPORT.md`

## API Implemented / Repaired

- `GET /api/v3/iot/devices/all-summary`

The response now populates per-house:

- `feedToday`: daily difference from property `2488`, falling back to `2532`
- `waterToday`: daily difference from property `2484`
- `feedCumNow`: current cumulative feed reading
- `waterCumNow`: current cumulative water reading

Daily usage source:

- Prefer `mon_device_property_daily_agg.max_val` for today minus yesterday.
- If yesterday is unavailable, return today's non-negative cumulative value.
- If today's aggregate is unavailable, fall back to the current realtime snapshot value.
- If no usable reading exists, keep `null`.

## RBAC / DataScope / Audit Coverage

- RBAC preserved: route still requires `MENU_DEVICE_MONITOR:V` through `MenuGuard`.
- DataScope unchanged: this existing device summary route did not use `DataScopeGuard`; this repair did not expand access.
- Audit unchanged: read-only route, no mutation and no audit event added.
- Attachment ACL unaffected.

## Frozen Items

- No migrations.
- No schema/entity/table/column changes.
- No database writes.
- No production deploy.
- No push.
- No frontend changes.
- No task board mutation.
- Commit attempted but blocked by filesystem sandbox: worktree gitdir points to `/Users/mac/phoenix-erp/.git/worktrees/a3-backend-critical-path`, and the current sandbox cannot write `index.lock` there.

## Validation Commands

Passed:

```bash
cd apps/api && ./node_modules/.bin/tsc --noEmit
cd apps/api && ./node_modules/.bin/jest --runInBand
```

Jest result: 6 test suites passed, 54 tests passed.

Blocked command:

```bash
cd apps/api && pnpm test -- --runInBand
```

This did not reach Jest. The runtime wrapper attempted dependency install, failed network metadata fetch, then aborted module purge due to no TTY.

## Blockers / Conditions

- A3 backend route is repaired.
- Local commit is pending because `git add` failed with `Operation not permitted` on the parent repository gitdir.
- A4 should run `/home` browser smoke to confirm the two KPI cards render non-empty when IoT aggregate or snapshot data exists.
- If the target user has `MENU_FARM_DATA:V` but lacks `MENU_DEVICE_MONITOR:V`, `/home` may still silently drop the IoT summary request. That is an RBAC/product decision and should be reviewed by A2/A4 before broadening access.

## Next Review Request

Please route to A4 frontend/UAT smoke for `/home` and A2 security review only if product wants `/home` farm KPI cards visible to users without `MENU_DEVICE_MONITOR:V`.

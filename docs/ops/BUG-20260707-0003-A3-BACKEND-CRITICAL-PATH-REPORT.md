# BUG-20260707-0003 A3 Backend Critical Path Report

Date: 2026-07-10
Agent: A3-Backend-Critical-Path
Branch: codex/bug-intake-a3
Route: `/home`
Source bug: BUG-20260707-0003
Source repair task: BUGTASK-20260707-0003
Result: PASS WITH CONDITIONS
Gate: GO TO CI ONLY

## Diagnosis

The captured failed request was:

- `GET /api/v3/iot/devices/all-summary`
- Response: `403 MENU_PERMISSION_DENIED`
- Reporter roles: finance-focused roles including `ROLE_HQ_FINANCE`, `ROLE_FIN_COST`, `ROLE_TREASURY_MANAGER`, and `ROLE_FINANCE_ANALYST`.

Backend source diagnosis confirmed that `IotV3Controller` applies `@RequireMenu('MENU_DEVICE_MONITOR', 'V')` at class level. That is correct for the device-monitoring page, but `/home` also reads the same `all-summary` endpoint for the operations workbench. Finance/dashboard users can hold `MENU_DASHBOARD:V` without holding `MENU_DEVICE_MONITOR:V`, so the menu guard denied the read-only summary before any SQL executed.

The source bug was classified as PG/SQL, but local backend evidence points to RBAC metadata as the root cause for the captured `MENU_PERMISSION_DENIED` response.

## Fix

Changed only the read-only summary endpoint:

- `GET /api/v3/iot/devices/all-summary` now accepts `MENU_DEVICE_MONITOR:V` or `MENU_DASHBOARD:V`.
- `POST /api/v3/iot/devices/sync/realtime` remains restricted to `MENU_DEVICE_MONITOR:E`.
- No RBAC bypass, public route, schema change, migration, database write, frontend change, deploy, or push was performed.

## Changed Files

- `apps/api/src/modules/iot/iot-v3.controller.ts`
  - Added method-level `@RequireMenu(DEVICE_MENU, 'V', ['MENU_DASHBOARD'])` to `getAllSummary()`.
- `apps/api/src/modules/iot/iot-v3.controller.spec.ts`
  - Added focused RBAC metadata regression tests for `getAllSummary()` and `syncRealtime()`.
- `docs/ops/BUG-20260707-0003-A3-BACKEND-CRITICAL-PATH-REPORT.md`
  - This task-specific repair report.

## Validation

Attempted:

- `cd apps/api && pnpm test -- iot-v3.controller.spec.ts --runInBand`
  - FAIL TO RUN: `jest: command not found`; this worktree has no `apps/api/node_modules`.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - FAIL TO RUN: `./node_modules/.bin/tsc` does not exist.
- `cd apps/api && pnpm install --frozen-lockfile --offline`
  - FAIL: pnpm store is missing `concurrently-8.2.2`; offline install cannot hydrate dependencies.

Passed:

- `git diff --check`
- Static source verification:
  - `all-summary` has `@RequireMenu(DEVICE_MENU, 'V', ['MENU_DASHBOARD'])`.
  - `sync/realtime` still has `@RequireMenu(DEVICE_MENU, 'E')`.
  - The new spec locks both permissions.

## Conditions

PASS WITH CONDITIONS because the backend source fix and focused regression spec are present, but local Jest and API typecheck could not run without dependencies.

Before claiming the production bug is resolved, CI/CD must run the focused Jest test and API typecheck, then production smoke must verify that a `/home` user with `MENU_DASHBOARD:V` and without `MENU_DEVICE_MONITOR:V` no longer sees the `403 MENU_PERMISSION_DENIED` toast. Business acceptance from the reporter or equivalent finance role is still required.

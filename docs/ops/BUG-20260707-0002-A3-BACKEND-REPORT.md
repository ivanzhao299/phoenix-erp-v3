# BUG-20260707-0002 A3 Backend Repair Report

Date: 2026-07-10
Agent: A3-Backend-Critical-Path
Branch: codex/bug-intake-a3
Route: `/warehouse`
Source bug: BUG-20260707-0002
Source repair task: BUGTASK-20260707-0002
Result: PASS WITH CONDITIONS

## Diagnosis

The captured failure was a backend RBAC mismatch on the warehouse overview. The page was visible under warehouse view permission, but its read-only dashboard requests hit Generic CRUD WMS tables:

- `GET /api/crud/wms_zones?limit=100&offset=0`
- `GET /api/crud/wms_inbound?limit=200&offset=0`
- `GET /api/crud/wms_outbound?limit=200&offset=0`

Root cause: Generic CRUD previously treated every `wms_*` access as `MENU_WMS_INOUT`, including read-only `GET` calls. A user with `MENU_WMS_VIEW:V` but without in/out operation permission could open the menu and then receive `403` from the backend data requests.

Current baseline evidence: `apps/api/src/modules/generic-crud/generic-crud.controller.ts` already contains the backend repair for this bug:

- `GET wms_*` maps to `MENU_WMS_VIEW`.
- `MENU_WMS_INOUT:V` remains accepted as a read fallback.
- WMS writes still map to `MENU_WMS_INOUT` with `C/E/D` operation-specific checks.

## Changed Files

- `apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts`
  - Expanded the regression test to cover all three captured failed requests with `MENU_WMS_VIEW:V`.
  - Added a negative regression proving a user without `MENU_WMS_VIEW` or `MENU_WMS_INOUT` still receives `ForbiddenException` for WMS reads.
- `docs/ops/BUG-20260707-0002-A3-BACKEND-REPORT.md`
  - Rewritten for the 2026-07-10 redispatch evidence pass.

## Backend Behavior Covered

- Allowed: `GET /api/crud/wms_zones` with `MENU_WMS_VIEW:V`.
- Allowed: `GET /api/crud/wms_inbound` with `MENU_WMS_VIEW:V`.
- Allowed: `GET /api/crud/wms_outbound` with `MENU_WMS_VIEW:V`.
- Preserved: `GET /api/crud/wms_*` with legacy `MENU_WMS_INOUT:V`.
- Preserved: `POST /api/crud/wms_*` requires `MENU_WMS_INOUT:C`.
- Preserved: WMS reads without `MENU_WMS_VIEW` or `MENU_WMS_INOUT` still fail closed.

## Validation

Attempted:

- `cd apps/api && ./node_modules/.bin/jest src/modules/generic-crud/generic-crud.controller.spec.ts --runInBand`
  - NOT RUN: `apps/api/node_modules/.bin/jest` does not exist in this worktree.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - NOT RUN: `apps/api/node_modules/.bin/tsc` does not exist in this worktree.
- `pnpm install --offline --frozen-lockfile`
  - FAIL: pnpm store missing `concurrently-8.2.2`; offline install cannot restore dependencies.
- `pnpm install --frozen-lockfile`
  - INTERRUPTED after network sandbox failure: registry fetches failed with `EPERM 127.0.0.1:7890`.
- `git diff --check`
  - PASS.

Static verification:

- Current backend permission source confirms `tableToFallbackMenu()` returns `MENU_WMS_VIEW` for `GET wms_*` and `MENU_WMS_INOUT` for WMS writes.
- Current backend permission source confirms `tableToAltMenus()` accepts `MENU_WMS_INOUT` only as a `GET wms_*` fallback.
- The updated regression test is fully mocked and does not require database access when dependencies are available.

## Guardrails

- No migrations created or executed.
- No schema, entity, table, or column changes.
- No database writes.
- No frontend changes.
- No deploy.
- No push.

## Conditions

PASS WITH CONDITIONS because local dependency restoration is blocked in this sandbox, so Jest and API typecheck could not be executed here. Before claiming the production bug is resolved, CI/CD must run the focused Jest test and API typecheck, followed by production smoke and business acceptance for a user with `MENU_WMS_VIEW:V` and without `MENU_WMS_INOUT`.

# BUG-20260707-0007 A4 Frontend UAT Smoke Report

## Result

PASS WITH CONDITIONS / HOLD for full UAT smoke.

The frontend repair is implemented in the allowed scope. Local TypeScript and browser smoke could not be completed because this worktree has no installed dependencies and offline install cannot hydrate the missing pnpm package tarballs.

## Changed Files

- `apps/web/src/app/(admin)/warehouse/zones/page.tsx`
- `apps/web/src/app/(admin)/warehouse/locations/page.tsx`
- `apps/web/src/lib/api-client.ts`
- `docs/ops/BUG-20260707-0007-a4-frontend-uat-smoke.md`

## Page / Component List

- `/warehouse/zones`
  - `PageHeader`
  - `DataTable`
  - `RightDrawer`
  - `CrudForm`
- `/warehouse/locations`
  - `ModalV2`
  - `WarehouseSelector`
  - `ZoneSelector`
- Shared frontend API client:
  - `crudApi.get`
  - `crudApi.update`
  - `crudApi.delete`

## UI/UX Adjustment Summary

- Added an explicit top-right `新增库区` action on `/warehouse/zones`, wired to the existing new-zone drawer.
- Kept the existing table refresh and edit/delete actions unchanged.
- Set zone `warehouse_code` as required so zones are created under a warehouse and can be filtered by the location form.
- Set zone `status` as required with default `ACTIVE`, because `/warehouse/locations` uses `ZoneSelector`, which only loads active zones.
- Added string primary-key compatibility for CRUD requests and used `zone_code` / `location_code` as fallback keys when rows do not include `id`.
- Fixed the `/warehouse/locations` edit/delete path that could call `/api/crud/wms_locations/undefined`.

## Permission Visibility Notes

- No RBAC bypass was added.
- Existing menu permission remains `MENU_WMS_MASTER`.
- Existing page-level visibility and CRUD API authorization are preserved.
- The new `新增库区` button only opens the same frontend drawer that was already reachable through the page callback.

## Responsive Behavior Notes

- The new zone action uses the existing `PageHeader` action slot and shared `primaryActionButton` token.
- Existing responsive behavior of `PageHeader`, `DataTable`, `RightDrawer`, and `ModalV2` is unchanged.
- No new fixed-width layout was introduced beyond the existing drawer/table configuration.

## UAT Smoke Result

- `pwd`: `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke`
- `git branch --show-current`: `w5-a4-frontend-uat-smoke`
- Initial `git status --short`: clean
- `git diff --check`: PASS
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: FAIL, `./node_modules/.bin/tsc` missing
- `pnpm --filter web typecheck`: FAIL, `tsc: command not found`
- `pnpm install --offline --frozen-lockfile`: FAIL, pnpm store missing `chalk-4.1.2.tgz`
- Browser smoke: HOLD, local web server cannot be started without dependencies

## A2 Security Review Required

Required only as a normal regression gate if this change is promoted. The repair does not add permission bypass, token handling, ACL changes, attachment changes, or DataScope changes.

## A1 Validation Required

Required. A1 should run web typecheck/build and route smoke after dependencies are available.

## Orchestrator Main-Workspace Validation

After A4 produced the repair diff, Codex-Orchestrator reconciled it into the main workspace because the A4 worktree dependency tree was missing.

- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS
- `git diff --check`: PASS
- Migration executed: No
- DB write executed: No
- Backend touched by A4 reconciliation: No

## Blockers And Next Recommendation

- Original A4 worktree blocker: local dependency tree is not installed, and offline pnpm store is incomplete.
- Main-workspace validation cleared the typecheck blocker.
- Remaining recommendation: browser smoke `/warehouse/zones` and `/warehouse/locations` after deploy.

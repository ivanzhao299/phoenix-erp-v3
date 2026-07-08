# BUG-20260707-0007 A4 Frontend UAT Smoke Report

## Result

GO WITH CONDITIONS.

Frontend repair is implemented inside the approved A4 scope. Web typecheck now passes after hydrating the A4 worktree dependencies. Browser UAT should still be performed after deployment because this report only validates static frontend behavior and the route handoff.

## Changed Files

- `apps/web/src/app/(admin)/warehouse/locations/page.tsx`
- `apps/web/src/app/(admin)/warehouse/zones/page.tsx`
- `apps/web/src/components/shared-selectors/MasterDataSelectors.tsx`
- `apps/web/src/locales/zh.json`
- `apps/web/src/locales/en.json`
- `apps/web/src/locales/lo.json`
- `docs/ops/BUG-20260707-0007-a4-frontend-uat-smoke.md`

## Page / Component List

- `/warehouse/locations`
  - `ModalV2`
  - `WarehouseSelector`
  - `ZoneSelector`
- `/warehouse/zones`
  - `PageHeader`
  - `DataTable`
  - `RightDrawer`
  - `CrudForm`
- Shared selector:
  - `ZoneSelector`

## UI/UX Adjustment Summary

- Made `ZoneSelector` reload when `warehouseCode` changes, so the location form does not keep a stale zone list after selecting another warehouse.
- Changed the zone selector CRUD query to request `limit=500`, matching the generic CRUD pagination contract and avoiding a truncated default page.
- Marked `库区` as required in the location modal and disabled save until `location_code`, `warehouse_code`, and `zone_code` are present.
- Added an inline `新增库区` link beside the location modal's `库区` label.
- Added `/warehouse/zones?action=new&warehouseCode=...` support so the zone drawer opens directly and pre-fills the selected warehouse from the location form.
- Added the `ui.新增库区` locale key for zh/en/lo.

## Permission Visibility Notes

- No RBAC bypass was added.
- Existing menu visibility remains governed by `MENU_WMS_MASTER`.
- The new inline link only routes to `/warehouse/zones`, which is already a protected warehouse master page.
- DataScope remains enforced by existing backend CRUD and lookup/read paths; no frontend hidden security shortcut was introduced.

## Responsive Behavior Notes

- The new `新增库区` action is a compact inline text/icon link inside the existing two-column modal grid.
- It uses nowrap text to avoid wrapping into the selector control on desktop.
- No new fixed-width page layout, drawer width, table width, or mobile-only layout rule was introduced.

## UAT Smoke Result

- `pwd`: PASS, `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke`
- `git branch --show-current`: PASS, `w5-a4-frontend-uat-smoke`
- initial `git status --short`: PASS, clean
- `git log --oneline --decorate -8`: PASS, branch history inspected
- `git diff --check`: PASS
- forbidden-scope audit: PASS, no `apps/api/**`, migration, schema/entity/table/column changes
- targeted source audit: PASS, found expected `reloadDeps={[warehouseCode]}`, required `zone_code` save gate, and `action=new` zone handoff
- `pnpm install --frozen-lockfile`: PARTIAL PASS, dependencies were hydrated; pnpm returned non-zero only because `esbuild` build-script approval is governed by the existing workspace allowBuilds policy.
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS
- `node scripts/check-i18n-keys.js`: HOLD, 7 pre-existing locale keys are missing in this older A4 worktree baseline; the new `ui.新增库区` key is present in zh/en/lo.
- browser route smoke: HOLD, requires a running web server or deployed environment.

## A2 Security Review Required

Yes, as a normal promotion gate because this touches permission-visible warehouse master UI. No new security-sensitive mechanism was added.

## A1 Validation Required

Yes. A1 should run web typecheck/build and browser smoke after dependencies are available.

## Orchestrator Main-Workspace Validation

After A4 produced the repair diff, Codex-Orchestrator reconciled it into the main workspace because the A4 worktree dependency tree was missing.

- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS
- `git diff --check`: PASS
- Migration executed: No
- DB write executed: No
- Backend touched by A4 reconciliation: No

## Blockers And Next Recommendation

- Condition: run browser smoke for `/warehouse/locations` -> `新增库位` -> `新增库区` -> create ACTIVE zone -> return and select the new zone.
- Main-workspace validation cleared the typecheck blocker.
- Remaining recommendation: browser smoke `/warehouse/zones` and `/warehouse/locations` after deploy, then close BUG-20260707-0007 if the user can create a zone and immediately select it when creating a location.

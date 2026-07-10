# BUG-20260707-0004 A3 Backend Critical Path Report

## Source

- Bug: `BUG-20260707-0004`
- Task: `BUGTASK-20260707-0004`
- Route: `/warehouse/query`
- Reported symptom: `tangzhiwen` sees `共 0 条记录` for inventory query; acceptance also requires inventory ledger visibility.

## Diagnosis

The `/warehouse/query` page first calls `GET /api/inventory/batches`. Local source showed that backend endpoint returned rows only when legacy `inv_batches.qty > 0`, while current inventory-facing code and UI use `qty_available` as the available-stock source. Rows with `qty_available > 0` but stale or zero `qty` were therefore filtered out and surfaced as an empty page.

The ledger page uses Generic CRUD on `inv_ledger`. That path required `MENU_WMS_VIEW` as the primary menu and did not accept the more specific inventory read menus that historical WMS operator roles may hold (`MENU_INV_BATCH`, `MENU_INV_LEDGER`, `MENU_WMS_INOUT`). DataScope resolution also used the primary menu even when an alternate menu granted access, which could produce an empty warehouse scope.

## Changes

- `apps/api/src/modules/wms/wms.service.ts`
  - Changed inventory batch and summary predicates from `qty > 0` to `COALESCE(qty_available, qty, 0) > 0`.
- `apps/api/src/modules/wms/inventory.controller.ts`
  - Allowed `GET /api/inventory/batches` and `/summary` through `MENU_INV_BATCH:V` or `MENU_WMS_INOUT:V` as read-only alternatives to `MENU_WMS_VIEW:V`.
- `apps/api/src/modules/generic-crud/generic-crud.controller.ts`
  - Added read-only alternate menus for `inv_batches` and `inv_ledger`.
  - Resolved warehouse DataScope using the menu that actually granted access.
- `apps/api/src/modules/org/guards/data-scope.guard.ts`
  - Resolved DataScope against the matched alternate menu when `@RequireMenu(..., altMenus)` is used.
- Added focused tests:
  - `apps/api/src/modules/wms/wms.service.spec.ts`
  - `apps/api/src/modules/org/guards/data-scope.guard.spec.ts`
  - Expanded `apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts`

## Validation

Attempted:

```bash
cd apps/api && pnpm test -- generic-crud.controller.spec.ts wms.service.spec.ts data-scope.guard.spec.ts --runInBand
```

Result: blocked locally, `jest: command not found`; `apps/api/node_modules` is absent.

```bash
cd apps/api && ./node_modules/.bin/tsc --noEmit
```

Result: blocked locally, `./node_modules/.bin/tsc` is absent.

```bash
pnpm exec jest --config apps/api/jest.config.js apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts apps/api/src/modules/wms/wms.service.spec.ts apps/api/src/modules/org/guards/data-scope.guard.spec.ts --runInBand
pnpm exec tsc -p apps/api/tsconfig.json --noEmit
```

Result: blocked locally, pnpm reports `Command "jest" not found` and `Command "tsc" not found`.

Static verification completed:

- Confirmed the old `GET /api/inventory/batches` predicate no longer contains `WHERE qty > 0`.
- Confirmed new inventory read predicate is `COALESCE(qty_available, qty, 0) > 0`.
- Confirmed `inv_batches` and `inv_ledger` Generic CRUD reads now include inventory/WMS read-only alternate menus.
- Confirmed DataScopeGuard uses `resolveMatchedMenu()` for alternate-menu requests.

## Result

PASS WITH CONDITIONS.

Conditions before declaring the production bug resolved:

- CI must run focused Jest tests and API typecheck.
- Production smoke must verify `tangzhiwen` can see scoped rows on `/warehouse/query` and `/warehouse/ledger`.
- Business owner must accept the result.

No database writes, migrations, deploys, pushes, or task-board updates were performed.

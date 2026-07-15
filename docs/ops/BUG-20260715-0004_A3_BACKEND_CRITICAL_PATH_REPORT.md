# BUG-20260715-0004 A3 Backend Critical Path Report

## Result

PASS WITH CONDITIONS

## Source

- Source bug: `BUG-20260715-0004`
- Source repair task: `BUGTASK-20260715-0004`
- Route: `/master/farms`
- Request: add farm archive creation and expose farm archive from the master data center.

## Diagnosis

Static diagnosis found that `/master/farms` uses legacy `brd_farms` through generic CRUD:

- List/create/update/delete API: `/api/crud/brd_farms`
- Existing backend primary permission: `MENU_FARM_MASTER`
- Frontend route already posts new farms to `POST /api/crud/brd_farms`

The backend RBAC gap is that the page is now surfaced as a master-data center workflow, but `brd_farms` accepted only the breeding master permission. Users who have organization master-data maintenance permission (`MENU_MD_ORG:C/E/V`) could be blocked by backend RBAC even though the workflow belongs under master data.

Separate frontend evidence: the route passes `onNew` to `DataTable`, but `DataTable` hides toolbar new buttons unless `showNewInToolbar` is explicitly enabled. The visible missing "new" button and sidebar submenu are frontend/menu-surface work and were not edited under the A3 backend contract.

## Backend Change

Changed files:

- `apps/api/src/modules/generic-crud/generic-crud.controller.ts`
- `apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts`

Implementation:

- Added `MENU_MD_ORG` as an alternate permission for `brd_farms` `GET`/`POST`/`PUT`.
- Kept `DELETE` restricted to `MENU_FARM_MASTER:D`.
- Added regression tests proving `MENU_MD_ORG:C` can create `brd_farms`, while `MENU_MD_ORG:D` still cannot delete it.

No migrations, schema changes, database writes, deploys, pushes, or task-board updates were performed.

## Validation

- `cd apps/api && pnpm test -- generic-crud.controller.spec.ts --runInBand`
  - PASS: 1 suite, 14 tests.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS.

## Conditions

This report does not claim the full bug is production-resolved. Remaining acceptance work outside A3 backend scope:

- Add or expose the visible "新建养殖场" UI affordance on `/master/farms`.
- Add the "养殖场档案" submenu under the master data center navigation/menu surface.
- Complete CI/CD, production smoke, and business acceptance after frontend/menu work is merged.

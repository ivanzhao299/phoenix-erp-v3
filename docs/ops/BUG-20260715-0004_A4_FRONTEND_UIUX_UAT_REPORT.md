# BUG-20260715-0004 A4 Frontend UIUX UAT Report

## Source

- Bug: BUG-20260715-0004
- Task: BUGTASK-20260715-0004
- Route: `/master/farms`
- Request: add farm archive create entry and add a "养殖场档案" submenu under 主数据中心.

## Root Cause

`/master/farms` already had create logic wired through `onNew`, but `DataTable` defaults `showNewInToolbar=false` and the page did not provide a `PageHeader.actions` create button. The existing create callback therefore had no visible UI entry. 主数据中心 also had no child menu item pointing to `/master/farms`.

## Changed Files

- `apps/web/src/app/(admin)/master/farms/page.tsx`
  - Added a visible `新增养殖场` header action.
  - Preserved RBAC by exposing create/edit/delete only through `MENU_FARM_MASTER:C/E/D`.
  - Added defensive permission checks before create/edit/delete fetches.
  - Fixed the page-level permission early return so Hooks are not conditional.
- `apps/web/src/components/layout/Sidebar.tsx`
  - Added 主数据中心 submenu `养殖场档案` -> `/master/farms`.
  - Reused existing route permission `MENU_FARM_MASTER`.
- `apps/web/src/locales/{zh,en,lo}.json`
  - Added `menu.mdc-farms`.
- `apps/web/src/lib/master-farms-menu.test.ts`
  - Added regression coverage for menu visibility and route access.

## Validation

- `cd apps/web && ./node_modules/.bin/tsc --noEmit` — PASS.
- `cd apps/web && ./node_modules/.bin/vitest run src/lib/master-farms-menu.test.ts` — PASS, 2/2 tests.
- `cd apps/web && ./node_modules/.bin/eslint 'src/app/(admin)/master/farms/page.tsx' src/lib/master-farms-menu.test.ts` — PASS.
- Static route/menu verification with `rg` confirmed:
  - `新增养殖场` action exists on `/master/farms`.
  - create/edit/delete visibility is gated by `canCreate/canEdit/canDelete`.
  - `mdc-farms` points to `/master/farms` with `MENU_FARM_MASTER`.

## Desktop / Mobile Check

Attempted to start local Next.js for desktop/mobile browser smoke:

- `cd apps/web && ./node_modules/.bin/next dev -p 3000` — blocked by sandbox: `listen EPERM 0.0.0.0:3000`.
- `cd apps/web && ./node_modules/.bin/next dev -H 127.0.0.1 -p 3000` — blocked by sandbox: `listen EPERM 127.0.0.1:3000`.

Static UI review: the new create button uses the existing `PageHeader.actions` flex action slot and `primaryActionButton` token, and the create/edit form continues to use existing `RightDrawer` + `CrudForm` behavior. No production write, deploy, migration, or database command was run.

## States / Permissions

- Permission visibility preserved:
  - View: `MENU_FARM_MASTER:V`.
  - Create button: `MENU_FARM_MASTER:C`.
  - Edit action: `MENU_FARM_MASTER:E`.
  - Delete action: `MENU_FARM_MASTER:D`.
- Loading/error/empty behavior remains owned by existing `DataTable`.
- Delete loading state is passed to `ConfirmDialog`.
- Attachment ACL not changed; this page does not introduce attachment upload.

## Result

PASS WITH CONDITIONS.

Conditions before calling the production bug resolved:

- Run desktop and mobile smoke in an environment that permits local or staging browser access.
- CI/CD must pass.
- Production smoke and business acceptance are still required.

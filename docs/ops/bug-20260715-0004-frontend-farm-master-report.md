# BUG-20260715-0004 Frontend Repair Report

Source bug: `BUG-20260715-0004`
Source task: `BUGTASK-20260715-0004`
Agent: `A4-Frontend-UAT-Smoke`
Route: `/master/farms`

## Result

`PASS WITH CONDITIONS`

Release gate: `HOLD` until CI/CD, a real desktop/mobile browser smoke test, production smoke, and business acceptance confirm the behavior.

## Diagnosis

The bug evidence shows users reach farm archives through the breeding overview settings button, and the archive page exposes row edit/delete actions without a clear create affordance. The frontend route already owns a `POST /api/crud/brd_farms` create flow and `MENU_FARM_MASTER` page guard in this worktree, but the route title map still referenced the stale `menu.md-farms` key instead of the main-data-center child key.

Root cause addressed in frontend scope:

- `/master/farms` title/menu wiring was not fully aligned with the main data center `mdc-farms` entry.
- The create/action visibility rules were embedded directly in the page, making the regression easy to lose and hard to test.

No backend, schema, migration, entity, table, column, deploy, or database write was performed.

## Changed Files

- `apps/web/src/app/(admin)/layout.tsx`
  - Maps `/master/farms` to `menu.mdc-farms` so admin title text follows the main data center submenu key.
- `apps/web/src/app/(admin)/master/farms/page.tsx`
  - Uses a shared `MENU_FARM_MASTER` constant and farm UI state helper for create/action visibility.
  - Keeps create submit guarded by `MENU_FARM_MASTER:C` and edit/delete by their existing permissions.
- `apps/web/src/lib/master-farms-ui.ts`
  - Adds the farm archive path, label, permission constant, and UI state helper.
- `apps/web/src/lib/master-farms-menu.test.ts`
  - Covers main data center submenu exposure, direct route access, create affordance permission behavior, and title locale key.

## Permission / State Preservation

- View guard remains `MENU_FARM_MASTER:V`.
- Create button and `onNew` remain available only with `MENU_FARM_MASTER:C`.
- Row actions remain available only when edit or delete is allowed.
- Save still has a second permission guard before POST/PUT.
- Existing `DataTable` loading, empty, and error rendering paths were not changed.
- Existing `RightDrawer`, `CrudForm`, and table responsive styles were not changed.

## Validation

Commands run:

- `pnpm --filter web test -- src/lib/master-farms-menu.test.ts` -> PASS, 4 tests.
- `pnpm --filter web typecheck` -> PASS, `tsc --noEmit`.

Attempted but blocked by local sandbox:

- `pnpm --filter web dev` -> FAIL, `listen EPERM 0.0.0.0:3000`.
- `pnpm --filter web exec next dev -H 127.0.0.1 -p 3000` -> FAIL, `listen EPERM 127.0.0.1:3000`.
- `pnpm --filter web build` -> FAIL before route validation because Turbopack rejects the `apps/web/node_modules` symlink pointing outside the sandbox filesystem root.

Desktop/mobile behavior evidence:

- Runtime browser smoke could not be completed because the sandbox denies local server listening.
- Static responsive check confirmed the affected page still uses shared table horizontal overflow and mobile full-screen drawer behavior:
  - `DataTable` table wrapper has `overflow-x: auto`.
  - `RightDrawer` switches to `width: 100vw` and `height: 100dvh` at `max-width: 768px`.

## Conditions

Do not mark the bug resolved until:

1. CI runs Web typecheck/test/build in the normal environment.
2. `/master/farms` is smoke-tested on desktop and mobile viewport with a user holding `MENU_FARM_MASTER:V,C`.
3. Production smoke confirms the main data center submenu opens `/master/farms` and the create drawer can create a farm through the approved API path.
4. Business owner accepts the flow.

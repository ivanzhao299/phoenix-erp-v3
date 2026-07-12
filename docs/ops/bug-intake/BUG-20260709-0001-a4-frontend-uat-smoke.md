# BUG-20260709-0001 A4 Frontend Report

## Result

PASS WITH CONDITIONS / GO for CI and business UAT.

This report does not claim production resolution. CI/CD, production smoke, and business acceptance are still required before the bug can be closed.

## Source

- Bug: BUG-20260709-0001
- Task: BUGTASK-20260709-0001
- Route: `/warehouse/inbound`
- Acceptance: change the menu title from `手工入库` back to `入库管理`, and avoid unrequested title changes.

## Diagnosis

The `/warehouse/inbound` page header and breadcrumb already used `入库管理`, but the inventory sidebar menu entry `wh-in` used the fallback label `手工入库`. The rendered sidebar title comes from `t("menu.wh-in", item.label)`, so both the locale key and fallback label must stay aligned.

Checked `apps/web/src/locales/zh.json`: `menu.wh-in` already equals `入库管理`. The frontend-owned mismatch was the sidebar fallback label.

## Changed Files

- `apps/web/src/components/layout/Sidebar.tsx`
  - Changed `/warehouse/inbound` sidebar item label from `手工入库` to `入库管理`.
  - Preserved `id`, `path`, icon, and permission gate `MENU_WMS_INOUT`.
- `apps/web/src/lib/warehouse-inbound-menu-label.test.ts`
  - Added focused regression coverage for the route menu entry and `zh` locale key.

## Guardrails

- No backend files changed.
- No API, schema, entity, migration, table, or column changes.
- No database writes.
- No deploy, merge, or push.
- RBAC preserved: `/warehouse/inbound` remains gated by `MENU_WMS_INOUT`.
- DataScope/audit/attachment ACL behavior unchanged because only the navigation label and a frontend test changed.
- Loading, empty, and error states on the inbound page were not modified.

## Verification

- `pnpm --filter web test -- src/lib/warehouse-inbound-menu-label.test.ts`
  - PASS, 1 test passed.
- `pnpm --filter web typecheck`
  - PASS, `tsc --noEmit`.
- Source route check:
  - `apps/web/src/components/layout/Sidebar.tsx` has `/warehouse/inbound` label `入库管理`.
  - `apps/web/src/app/(admin)/warehouse/inbound/page.tsx` page title and breadcrumb already use `入库管理`.
  - `apps/web/src/locales/zh.json` has `menu.wh-in: 入库管理`.

## Desktop And Mobile Check

Live local browser UAT could not run in this sandbox because Next.js dev server failed to listen on both `0.0.0.0:3000` and `127.0.0.1:3300` with `listen EPERM`.

Desktop/mobile behavior was checked by source path:

- Sidebar visible text for this route is produced from the same `MENU` item and `menu.wh-in` locale key across viewport sizes.
- Admin topbar title uses `pathTitle(pathname)` from the same `MENU` tree.
- No breakpoint-specific or mobile-specific alternate `/warehouse/inbound` title was found in the affected admin sidebar/title path.

Condition: CI or A1 should perform a real browser smoke in an environment where the web server can bind a port.

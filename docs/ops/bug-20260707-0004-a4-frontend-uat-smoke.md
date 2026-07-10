# BUG-20260707-0004 A4 Frontend UI/UX UAT Report

## Source

- Bug: `BUG-20260707-0004`
- Task: `BUGTASK-20260707-0004`
- Route: `/warehouse/query`
- Reporter account: `tangzhiwen`
- Acceptance: `用tangzhiwen账号库存查询、库存台账能查出数据`

## Root Cause

The frontend repair already moved `/warehouse/query` away from a generic `inv_batches` CRUD table and toward the WMS inventory endpoint `/api/inventory/batches`.

This A4 pass found one remaining frontend-owned risk: the page only normalized array, `data`, and `data.data` response shapes. If the dedicated endpoint returns a standard paginated envelope such as `{ data: { rows: [...] } }`, the page can still render `0` visible rows even when the API returned inventory.

## Changed Files

- `apps/web/src/app/(admin)/warehouse/query/page.tsx`
- `apps/web/src/lib/warehouse-query.ts`
- `apps/web/src/lib/warehouse-query.test.ts`
- `docs/ops/bug-20260707-0004-a4-frontend-uat-smoke.md`

## Frontend Fix

- Added route-specific helpers for inventory row normalization, search filtering, quantity selection, and date display.
- Normalized all supported API row envelopes: array, `data`, `data.data`, `data.rows`, `data.items`, `rows`, and `items`.
- Kept `/inventory/batches` as the primary read path and retained the existing generic CRUD fallback only for 404.
- Kept 403 handling explicit: the UI still tells the user to check `MENU_WMS_VIEW` and warehouse authorization instead of silently showing an empty table.
- Preserved loading and empty states.
- Added mobile-safe layout behavior: the search row wraps, the search input has a minimum width, and the inventory table uses horizontal overflow with a stable minimum table width.

## Permission / Scope Notes

- No RBAC bypass was added.
- Sidebar visibility remains governed by `MENU_WMS_VIEW`.
- The page still relies on backend DataScope from `/api/inventory/batches` and does not synthesize warehouse access client-side.
- Attachment ACL was not touched; this route has no attachment operation.

## Validation

- `pnpm --filter web exec vitest run src/lib/warehouse-query.test.ts` -> PASS, 5 tests.
- `pnpm --filter web exec eslint 'src/app/(admin)/warehouse/query/page.tsx' src/lib/warehouse-query.ts src/lib/warehouse-query.test.ts` -> PASS.
- `pnpm --filter web typecheck` -> PASS.
- Focused static route verification -> PASS:
  - `/warehouse/query` still calls `request("/inventory/batches", { silent: true })`.
  - CRUD fallback remains limited to 404 from the dedicated endpoint.
  - 403 error copy remains visible and specific to `MENU_WMS_VIEW` and warehouse scope.
  - loading and empty table states remain present.
- Desktop/mobile behavior check -> PASS WITH CONDITIONS:
  - Code audit confirms desktop summary cards still use responsive `auto-fit`.
  - Code audit confirms mobile search controls can wrap.
  - Code audit confirms wide inventory columns are horizontally scrollable on narrow screens.
  - Live browser smoke could not be performed because the sandbox rejected local Next server binds with `listen EPERM` on both `0.0.0.0:3300` and `127.0.0.1:3300`.

## Not Performed

- No API/backend files changed.
- No migrations, schema, entity, table, or column changes.
- No database reads or writes.
- No deploy, push, merge, or production smoke.
- No claim that production is resolved before CI/CD, production smoke, and business acceptance.

## Result

PASS WITH CONDITIONS.

The frontend-owned normalization gap is repaired and locally verified by focused tests, ESLint, and web typecheck. Final resolution still requires integrated CI/CD, production/staging smoke as `tangzhiwen`, and business acceptance that both `/warehouse/query` and `/warehouse/ledger` show the expected scoped inventory data.

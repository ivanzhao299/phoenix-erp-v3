# BUG-20260708-0004 A4 Frontend UAT Smoke Report

## Result

PASS WITH CONDITIONS

GO for CI/staging validation. Do not mark the source bug resolved until CI/CD, production smoke on `/warehouse/ledger`, and business acceptance confirm the deployed behavior.

## Source

- Bug: `BUG-20260708-0004`
- Task: `BUGTASK-20260708-0004`
- Route: `/warehouse/ledger`
- Title: 库存管理-库存台账，事务类型不显示中文
- Agent: `A4-Frontend-UAT-Smoke`

## Diagnosis

The frontend ledger page rendered `inv_ledger.change_type` directly inside the transaction type pill. The reported evidence showed raw audit codes such as `FARM_OUT_MEDICATION`, `TEMP_PRODUCTION_INBOUND`, `FARM_IN`, `MED_INBOUND`, and `MED_OUTBOUND` in the visible table.

This was a frontend-owned display gap. No backend, schema, migration, entity, table, column, database, deploy, push, or task-board change was required.

## Changed Files

- `apps/web/src/app/(admin)/warehouse/ledger/page.tsx`
  - Keeps the same `DataTable` source table, columns, paging, empty text, and read-only behavior.
  - Renders `change_type` through a localized display helper while preserving the raw code in the cell `title`.

- `apps/web/src/lib/warehouse-ledger-change-type.ts`
  - Adds Chinese labels and pill tones for known inventory ledger movement codes.
  - Keeps unknown codes visible as raw audit data instead of hiding or blanking them.

- `apps/web/src/lib/warehouse-ledger-change-type.test.ts`
  - Adds focused regression coverage for the raw codes captured in `BUG-20260708-0004`.

## Behavior Checks

- Desktop route behavior checked by source and focused tests:
  - `/warehouse/ledger` still fetches `table="inv_ledger"` through the existing generic `DataTable`.
  - The affected transaction type column now displays Chinese labels for the reported codes.
  - Quantity, reference document, operator, store, remark, pagination, and refresh behavior were not changed.

- Mobile behavior checked by source:
  - No responsive CSS or layout structure was changed.
  - The replacement labels are short Chinese text inside the existing fixed-width pill column, so the table layout behavior remains the same.

- Permission visibility and DataScope:
  - No sidebar, route guard, RBAC, CRUD endpoint, DataScope parameter, or API client logic was changed.
  - The page remains read-only because `DataTable` is still used without create/edit/delete actions.

- Loading, empty, and error states:
  - Existing `DataTable` loading overlay, `emptyText`, and error row branches are unchanged.
  - 403/404/relation-empty handling remains in the shared `DataTable` load path.

## Validation Commands

- `cd apps/web && ./node_modules/.bin/vitest run src/lib/warehouse-ledger-change-type.test.ts`
  - PASS: 1 file, 3 tests.
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 TypeScript errors.
- `cd apps/web && ./node_modules/.bin/eslint src/lib/warehouse-ledger-change-type.ts src/lib/warehouse-ledger-change-type.test.ts 'src/app/(admin)/warehouse/ledger/page.tsx'`
  - PASS: 0 ESLint errors.
- `git diff --check -- 'apps/web/src/app/(admin)/warehouse/ledger/page.tsx' apps/web/src/lib/warehouse-ledger-change-type.ts apps/web/src/lib/warehouse-ledger-change-type.test.ts`
  - PASS.
- `cd apps/web && ./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3024`
  - BLOCKED by local sandbox: `listen EPERM: operation not permitted 127.0.0.1:3024`.

## Conditions

- Browser-level desktop/mobile smoke could not be completed in this agent environment because local Next.js port binding is blocked.
- Final closure requires CI/CD, production or staging smoke with real `/warehouse/ledger` data, and business acceptance that the transaction type column no longer exposes the reported English codes.

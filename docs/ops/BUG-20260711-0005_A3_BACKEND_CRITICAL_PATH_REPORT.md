# BUG-20260711-0005 A3 Backend Critical Path Report

## Source

- Source bug: `BUG-20260711-0005`
- Source repair task: `BUGTASK-20260711-0005`
- Route: `/bug-reports`
- Failing backend evidence: repeated `GET /api/v2/finance/ap/invoices/8` and `GET /api/v2/finance/ap/invoices/9` returned HTTP 500 after creating AP invoices.
- User impact: AP invoice detail pane could not load, blocking the payment workflow entry point.

## Diagnosis

The AP invoice detail endpoint owned by `ApInvoicesService.findById()` loaded the invoice row successfully, then unconditionally queried `fin_ap_payment_allocations`.

Local source evidence shows drift between AP runtime code and deployed/bootstrap DDL:

- `apps/api/src/modules/finance-v2/services/ap-invoices.service.ts` queried `fin_ap_payment_allocations` in `findById()`.
- `apps/api/ddl/22_finance_v2_tables.sql` creates `fin_ap_invoices` but does not create `fin_ap_payment_allocations`.
- Older historical SQL also used `fin_ap_payments`, so AP payment-history storage has existed under more than one table name.

Root cause: AP invoice detail read path was not tolerant of AP payment-history table drift. A missing `fin_ap_payment_allocations` relation raises Postgres `42P01`, which surfaced as HTTP 500 and prevented the right-side AP invoice detail pane from rendering.

## Changed Files

- `apps/api/src/modules/finance-v2/services/ap-invoices.service.ts`
  - Expanded the detail ownership query to return the full invoice fields needed by the detail pane.
  - Moved payment-history loading into `loadPaymentAllocations()`.
  - On Postgres `42P01` only, falls back from `fin_ap_payment_allocations` to legacy `fin_ap_payments`.
  - If neither payment-history table exists, returns the AP invoice detail with `allocations: []` instead of failing the whole detail endpoint.
  - Non-`42P01` database errors are still rethrown.
- `apps/api/src/modules/finance-v2/services/ap-invoices.service.spec.ts`
  - Added regression coverage for missing `fin_ap_payment_allocations` with legacy payment fallback.
  - Added regression coverage for missing allocation and legacy payment tables returning detail with empty allocations.

No frontend files, migrations, entities, schema, table, or column definitions were changed.

## Validation

- Focused regression test:
  - Command: `cd apps/api && pnpm test -- ap-invoices.service.spec.ts --runInBand`
  - Result: PASS, `Test Suites: 1 passed, Tests: 4 passed`
- API typecheck:
  - Command: `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - Result: PASS, zero TypeScript errors

No database writes, migration execution, deploy, push, task-board write, or production command was performed.

## Result

PASS WITH CONDITIONS

Backend-owned 500 path is repaired and covered by focused tests. Final business resolution still requires CI/CD, production route smoke for `GET /api/v2/finance/ap/invoices/:id`, and business acceptance that the AP detail pane loads and payment can proceed in the deployed environment.

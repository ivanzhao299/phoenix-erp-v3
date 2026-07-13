# BUG-20260713-0001 A3 Backend Critical Path Report

## Source

- Bug: `BUG-20260713-0001`
- Repair task: `BUGTASK-20260713-0001`
- Route: `/finance2/ap`
- Symptom: 财务结算中心 / 应付账款选中新建应付发票后，没有可以付款的地方。

## Diagnosis

The backend AP runtime exposed invoice list/detail/create/update/cancel/import endpoints, and detail already returned payment allocation history. It did not expose any AP invoice payment endpoint that could create a payment allocation, deduct a cash account, update AP invoice paid/balance/status, and append a cash ledger transaction.

This is backend-owned because a frontend payment action would have had no AP Runtime endpoint to call under `/api/v2/finance/ap`.

## Root Cause

`FinApController` and `ApInvoicesService` were missing the AP payment execution path. The read side had `loadPaymentAllocations()`, but there was no write-side equivalent.

## Changed Files

- `apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts`
  - Added `POST /api/v2/finance/ap/invoices/:id/pay`.
  - Guarded by `MENU_FIN2_AP:E`, matching treasury execution behavior in the existing procurement payment flow.
- `apps/api/src/modules/finance-v2/dto/ap-invoice.dto.ts`
  - Added `PayApInvoiceDto`.
- `apps/api/src/modules/finance-v2/services/ap-invoices.service.ts`
  - Added transactional `payInvoice()`.
  - Locks AP invoice and cash account with `SERIALIZABLE`.
  - Enforces DataScope, company, status, currency, invoice balance, and account balance checks.
  - Writes `fin_ap_payment_allocations`, with guarded fallback to legacy `fin_ap_payments` only if the current table is absent.
  - Updates AP paid/balance/status fields.
  - Deducts cash account and writes `fin_cash_transactions` with `source_type='AP_PAYMENT'`.
- `apps/api/src/modules/finance-v2/services/ap-invoices.service.spec.ts`
  - Added regression coverage for successful AP payment and overpayment rollback.

## Validation

- Focused regression:
  - `pnpm --dir apps/api test -- ap-invoices.service.spec.ts`
  - Result: PASS, 6 tests passed.
- API typecheck:
  - `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - Result: PASS, 0 errors.

## Non-Actions / Guardrails

- No frontend files changed.
- No migrations, schema, entity, table, or column changes.
- No database writes.
- No deploy, push, merge, or task board modification.

## Result

PASS WITH CONDITIONS

Backend critical path is now present and locally validated. The business bug cannot be claimed fully resolved until the frontend exposes a payment action for selected AP invoices, CI/CD passes, production smoke confirms the route, and business acceptance verifies the `/finance2/ap` payment workflow.

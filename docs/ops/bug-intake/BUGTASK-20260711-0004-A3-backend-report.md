# BUGTASK-20260711-0004 A3 Backend Report

## Source

- Bug: BUG-20260711-0004
- Task: BUGTASK-20260711-0004
- Route: `/finance2/ap`
- Issue: 应付账款未付发票状态不应显示为“未收款”，应显示为“未付款”。

## Diagnosis

Local backend inspection found AP invoices persist and return machine statuses correctly:

- Unpaid AP invoice state: `status = 'OPEN'`
- Unpaid AP payment state: `payment_status = 'UNPAID'`

The AP list/detail API did not expose AP-specific Chinese display labels. That leaves UI consumers able to reuse AR/collection wording for the shared `OPEN` state, which matches the reported screenshot text “未收款”.

## Root Cause

Backend AP invoice responses exposed only generic status codes and no AP-owned display contract. The business term for AP `OPEN` / `UNPAID` is “未付款”, not the AR collection term “未收款”.

## Changed Files

- `apps/api/src/modules/finance-v2/services/ap-invoices.service.ts`
  - Added AP-specific status label maps.
  - Decorated AP list, detail, manual create, PO create, and cancel responses with:
    - `status_label`
    - `payment_status_label`
  - Preserved existing `status` and `payment_status` codes.
- `apps/api/src/modules/finance-v2/services/ap-invoices.service.spec.ts`
  - Added focused regression coverage that unpaid AP list responses return `status_label: '未付款'` and never `未收款`.
  - Added detail coverage for cancelled AP label behavior.

## Validation

- `cd apps/api && ./node_modules/.bin/jest src/modules/finance-v2/services/ap-invoices.service.spec.ts --runInBand`
  - PASS: 2 tests passed.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 TypeScript errors.

## Safety Notes

- No frontend files changed.
- No migrations, schema, entity, table, or column changes.
- No database writes.
- No deployment, push, merge, or production command.
- RBAC and DataScope remain on the existing controller/service path.

## Result

PASS WITH CONDITIONS.

Backend now provides the AP-specific “未付款” label contract. Do not claim the production bug fully resolved until CI/CD passes, the deployed `/finance2/ap` page is smoke-tested, and business acceptance confirms the UI consumes the AP label correctly.

# BUGTASK-20260725-0001 Backend Repair Report

## Source bug

- Bug: `BUG-20260725-0001`
- Route: `/sales2/delivery`
- Failed request: `POST /api/v2/sales/delivery`
- Observed response: HTTP 400, `{"code":400,"msg":"数据格式不正确"}`
- Attachment evidence: the user entered the visible sales order number
  `SO-20260725-00001` in the field labelled “销售订单ID”.

## Root cause

`DeliveryOrdersService.create()` treated every `salesOrderIds` value as a database
bigint primary key and called `Number(ref)`. A visible business order number such
as `SO-20260725-00001` became `NaN`; passing that value to the bigint `ANY`
query caused PostgreSQL error `22P02`. The global exception filter mapped that
error to the reported HTTP 400 “数据格式不正确”.

This was a backend request-contract mismatch: the UI invites users to identify a
sales order, while the create service only accepted an internal numeric key.

## Repair

The create service now separates normalized references into:

- pure decimal strings, queried as `sal_sales_orders.id` bigint values;
- all other strings, queried as `sal_sales_orders.order_no` text values.

Duplicate and blank references are removed before lookup. Existing transaction,
order-status validation, RBAC/DataScope checks, audit creator, and downstream
write behavior are unchanged.

## Changed files

- `apps/api/src/modules/sales-v2/services/delivery-orders.service.ts`
- `apps/api/src/modules/sales-v2/services/delivery-orders.service.spec.ts`
- `docs/ops/BUGTASK-20260725-0001-backend-repair.md`

No frontend, migration, schema, entity, table, or column files were changed.
No database write, migration, deploy, push, or production command was executed.

## Validation

From `apps/api`:

```bash
./node_modules/.bin/jest src/modules/sales-v2/services/delivery-orders.service.spec.ts --runInBand
```

Result: PASS — 1 suite, 1 test. The regression test submits
`SO-20260725-00001`, verifies it is sent through the text `order_no` lookup
instead of the bigint parameter, and verifies the delivery creation path
completes with mocked persistence.

```bash
./node_modules/.bin/tsc --noEmit
```

Result: PASS — exit code 0, no TypeScript errors.

## Conclusion

PASS WITH CONDITIONS

The backend-owned failure is repaired and locally verified. This is not a claim
that the production bug is resolved: CI/CD, a production smoke test using an
eligible sales order, and business acceptance are still required.

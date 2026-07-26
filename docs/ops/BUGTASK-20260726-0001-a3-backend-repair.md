# BUGTASK-20260726-0001 Backend Repair Report

## Canonical conclusion

**PASS WITH CONDITIONS**

The backend defect has a focused local repair and regression coverage. This is
not a claim that BUG-20260726-0001 is resolved: CI/CD, production smoke testing,
and business acceptance are still required.

## Source bug

- Bug: `BUG-20260726-0001`
- Task: `BUGTASK-20260726-0001`
- Title: 销售管理-配送管理，签收时计划数量和默认的实际数量有误
- Acceptance example: ordered quantity `10`, unit price `50`; delivery receipt
  must show planned/default actual quantity `10`, not order amount `500`.

## Root cause

`DeliveryOrdersService.create()` selected `sal_sales_orders.total_amount` and
used it as both:

- `sal_delivery_orders.total_qty`
- `sal_delivery_order_items.planned_qty`

For quantity `10` at unit price `50`, `total_amount` is `500`, so the delivery
item exposed planned quantity `500`; the signing UI then derived its default
actual quantity from that incorrect planned quantity.

The correct backend source is the sum of `sal_order_items.qty` for each selected
sales order.

The unrelated captured 4xx/5xx requests were not changed because they do not
cause the reported `10` versus `500` quantity mismatch and are outside this
single approved repair.

## Changed files

- `apps/api/src/modules/sales-v2/services/delivery-orders.service.ts`
  - Aggregate `SUM(sal_order_items.qty)` per sales order.
  - Write the aggregate to delivery header `total_qty` and item `planned_qty`.
  - Preserve existing RBAC/DataScope checks and state transitions.
- `apps/api/src/modules/sales-v2/services/delivery-orders.service.spec.ts`
  - Regression case models `total_amount=500` and `planned_qty=10`.
  - Verifies header `total_qty=10` and item `planned_qty=10`.
- `docs/ops/BUGTASK-20260726-0001-a3-backend-repair.md`
  - This report.

No migration, schema, entity, table, column, database write, deploy, or push was
performed.

## Validation

Executed from `apps/api`:

```text
pnpm exec jest src/modules/sales-v2/services/delivery-orders.service.spec.ts --runInBand
PASS — 1 suite, 1 test

./node_modules/.bin/tsc --noEmit
PASS — exit 0, no diagnostics
```

Executed from the worktree root:

```text
git diff --check
PASS — no whitespace errors
```

## Conditions

Before declaring the source bug resolved:

1. CI/CD must pass on the integrated commit.
2. Production smoke must create an eligible sales order with quantity `10` and
   unit price `50`, then confirm delivery planned quantity and default received
   quantity are both `10`.
3. Business must accept the complete delivery-signing flow.


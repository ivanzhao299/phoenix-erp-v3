# BUGTASK-20260708-0007 A3 Backend Report

## Source Bug

- Bug: `BUG-20260708-0007`
- Task: `BUGTASK-20260708-0007`
- Route: `/sales2/orders`
- Failed request: `POST /api/v2/sales/orders`
- User-visible error: `HTTP 400`
- Response excerpt: `{"code":400,"msg":"字段不存在，请联系管理员"}`

## Diagnosis

The response text maps to PostgreSQL `42703` in `apps/api/src/common/filters/all-exceptions.filter.ts`, so the failure is an undefined-column SQL error.

The sales order draft flow inserts the order header, then inserts rows into `sal_order_items`. Recent SKU support writes the optional `sku_code` column in every order item INSERT. If production has the older `sal_order_items` shape without `sku_code`, draft save fails with `42703` and the global filter returns `字段不存在，请联系管理员`.

Static evidence:

- `apps/api/src/modules/sales-v2/services/sales-orders.service.ts` writes `sku_code` during draft item insert.
- `apps/api/migrations/20260530_product_master_h5_sales_sku.sql` adds `sal_order_items.sku_code`.
- The task forbids schema/migration changes, so the backend repair must not add or execute a migration.

Local DB schema verification was attempted but blocked by sandbox socket policy:

```text
psql: error: connection to server on socket "/tmp/.s.PGSQL.5432" failed: Operation not permitted
```

## Root Cause

Backend order-item INSERT assumed `sal_order_items.sku_code` is always present. In an environment where the H5 SKU column is absent, saving a sales order draft raises PostgreSQL `42703`, which is surfaced as HTTP 400.

## Changed Files

- `apps/api/src/modules/sales-v2/services/sales-orders.service.ts`
- `apps/api/src/modules/sales-v2/services/sales-orders.service.spec.ts`

## Fix

Added a narrow compatibility path for order item inserts:

- First try the current INSERT with `sku_code`.
- Only when PostgreSQL returns `42703` and the error message identifies `sku_code` on `sal_order_items`, retry the INSERT without `sku_code`.
- Re-throw all other SQL errors unchanged.

The same helper is used by create-draft and update-draft item rebuild paths.

## Validation

Commands run:

```bash
cd apps/api && pnpm test -- sales-orders.service.spec.ts
cd apps/api && ./node_modules/.bin/tsc --noEmit
```

Results:

- Focused regression test: PASS, `1 passed`.
- API typecheck: PASS, `0 errors`.

## Guardrail Status

- No frontend files changed.
- No migrations, schema, entity, table, or column changes made.
- No database writes performed.
- No deploy, push, merge, or production command performed.
- RBAC, DataScope, audit, and attachment ACL were not changed.

## Result

PASS WITH CONDITIONS

This backend fix removes the identified `sal_order_items.sku_code` undefined-column failure mode without schema changes. Final resolution still requires CI/CD, production smoke for `POST /api/v2/sales/orders`, and business acceptance on `/sales2/orders`.

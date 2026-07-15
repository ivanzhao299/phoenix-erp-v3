# BUG-20260715-0003 A3 Backend Report

## Source

- Source bug: `BUG-20260715-0003`
- Source repair task: `BUGTASK-20260715-0003`
- Assigned agent: `A3-Backend-Critical-Path`
- Route: `/procurement2/orders/new`
- Request: 采购订单界面在采购订单号前增加“采购订单ID”，并能查询到采购订单ID。

## Diagnosis

- Backend route used by procurement order data is `GET /api/v2/procurement/orders`.
- `Prc2PurchaseOrderEntity` already exposes the database primary key as `id`; `OrdersService.list()` returns entity rows with `id`, and `OrdersService.findById()` returns details by `id`.
- Gap found in backend-owned behavior: list keyword search only matched `poNo`, `subject`, `supplierName`, and `supplierCode`; searching by the visible “采购订单ID” would not match.
- UI column placement is frontend-owned and was not changed under the A3 backend-only contract.

## Root Cause

The procurement order list keyword predicate did not include `prc2_purchase_orders.id`, so the backend could return the ID field but could not filter list results by that ID through the existing `keyword` query.

## Changed Files

- `apps/api/src/modules/procurement-v2/services/orders.service.ts`
  - Added `CAST(p.id AS TEXT) ILIKE :kw` to the purchase order list keyword predicate.
- `apps/api/src/modules/procurement-v2/services/orders.service.spec.ts`
  - Added focused regression coverage asserting keyword search includes purchase order `id`.

## Validation

- `cd apps/api && pnpm test -- --runTestsByPath src/modules/procurement-v2/services/orders.service.spec.ts`
  - Result: PASS, 1 test suite passed, 1 test passed.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - Result: PASS, 0 TypeScript errors.

## Guardrails

- No deployment.
- No push.
- No database writes.
- No migrations or schema/entity/table/column changes.
- No `apps/web/**` changes.
- RBAC and DataScope are preserved: the keyword predicate still runs before the existing `scopeHelper.applyToQb(qb, { alias: 'p' })` filter.

## Result

PASS WITH CONDITIONS.

Backend gate: GO. Overall bug acceptance: HOLD until frontend column display, CI/CD, production smoke, and business acceptance are complete.

Backend now supports querying procurement orders by purchase order ID through the existing keyword filter, and the API already returns `id` in list/detail payloads. Full business acceptance still requires a frontend-owned change to display the “采购订单ID” column before “采购订单号”, plus CI/CD, production smoke, and business acceptance before declaring the bug resolved.

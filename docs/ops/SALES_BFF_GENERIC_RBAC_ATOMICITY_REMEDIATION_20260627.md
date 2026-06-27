# Sales BFF / Generic CRUD RBAC Atomicity Remediation

Date: 2026-06-27

## Scope

This batch tightens remaining sales-domain parent permission usage in BFF and Generic CRUD fallback paths.

## Findings

The following code paths still used the coarse parent permission `MENU_SALES2`:

- `PricingBffController` under `/api/pricing`
- `WholesaleBffController` under `/api/wholesale`
- `GenericCrudController.tableToFallbackMenu()` for `sal_*` tables

Using `MENU_SALES2` as an executable permission can let a role with broad sales access cross into price, customer, order, delivery, or return data without the corresponding atomic menu code.

## Changes

Backend BFF:

- `/api/pricing/**` now requires `MENU_SALES2_PRICE`.
- `/api/pricing/floating/:id` update now requires `MENU_SALES2_PRICE:E`.
- `/api/wholesale/**` now requires `MENU_SALES2_CUSTOMER`.
- `/api/wholesale/distributors/:id` update now requires `MENU_SALES2_CUSTOMER:E`.

Generic CRUD fallback:

- `sal_customers` -> `MENU_SALES2_CUSTOMER`
- `sal_channels` -> `MENU_SALES2_CHANNEL`
- `sal_price_books` / `sal_price_items` -> `MENU_SALES2_PRICE`
- `sal_sales_orders` / `sal_order_items` -> `MENU_SALES2_ORDER`
- `sal_delivery*` / `sal_receipts` -> `MENU_SALES2_DELIVERY`
- `sal_return*` -> `MENU_SALES2_RETURN`
- `sal_drivers` -> `MENU_MD_DRIVER`
- `sal_vehicles` -> `MENU_MD_VEHICLE`
- unknown `sal_*` -> no fallback

## Guardrail

`scripts/ci/check-menu-permission-atomicity.mjs` now blocks:

- `GenericCrudController` returning coarse `MENU_SALES2`
- Sales BFF controllers using `@RequireMenu('MENU_SALES2', ...)`

## Validation

Required checks:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`

## Risk

Risk level: Medium-low.

The change narrows access checks. Roles missing atomic sales permissions may lose access to BFF pricing or wholesale endpoints until their permission matrix is corrected. This is intended behavior for production-grade RBAC alignment.

## Result

Sales BFF and Generic CRUD fallback no longer treat `MENU_SALES2` as a cross-domain executable permission.

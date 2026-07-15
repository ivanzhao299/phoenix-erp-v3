# BUGTASK-20260715-0002 A3 Backend Report

## Source

- Bug: `BUG-20260715-0002`
- Task: `BUGTASK-20260715-0002`
- Route: `/warehouse/query`
- Title: 入库-库存查询、出库链路闭环问题

## Diagnosis

The backend inventory path was not SKU-safe:

- `WmsService.confirmInbound` required `product_code` for every effective inbound line, so a line carrying only `sku_code` could not be confirmed.
- Confirmed inbound rows wrote only `product_code` into `inv_batches`; `sku_code` was not persisted into `inv_batches` or `inv_ledger`, even though existing legacy migration `20260530_product_master_h4_inventory_sku.sql` already defines those columns.
- `GenericCrudController.buildWmsInboundConfirmPayload` collapsed `sku_code` into `product_code`, losing the distinction between SKU-selected inbound and manually-entered product/material code inbound.
- `WmsService.advanceOutboundOrder` could only deduct by `batch_no`; outbound lines carrying only `sku_code` or `product_code` were skipped, so SKU/product-based outbound could not close the inventory loop.

No schema or migration change was made.

## Changed Files

- `apps/api/src/modules/wms/wms.service.ts`
  - Allows inbound effective lines to provide either `product_code` or `sku_code`.
  - Persists `sku_code` into `inv_batches` and `inv_ledger` for normal and broken inbound.
  - Preserves optional product/material code when provided, without deriving product code from SKU.
  - Supports outbound shipment deduction by `batch_no`, `sku_code`, or `product_code`.
  - Deducts both `qty` and `qty_available` when shipping stock.
- `apps/api/src/modules/generic-crud/generic-crud.controller.ts`
  - Keeps `sku_code` separate when routing generic `wms_inbound` completion through `WmsService.confirmInbound`.
- `apps/api/src/modules/wms/wms.service.spec.ts`
  - Added regression coverage for SKU-only inbound confirmation and SKU-based outbound deduction.
- `apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts`
  - Added regression coverage proving generic inbound completion does not collapse SKU into product code.

## Validation

- `pnpm --filter phoenix-erp-v3-nest test -- wms.service.spec.ts generic-crud.controller.spec.ts`
  - PASS: 2 suites, 18 tests.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS.

## Scope Notes

- Did not modify `apps/web/**`.
- Did not add migrations, entities, tables, or columns.
- Did not run migrations.
- Did not write to any database.
- Did not deploy, merge, or push.

## Result

PASS WITH CONDITIONS.

Backend local repair and focused regression coverage are complete. Do not claim the production bug is resolved until CI/CD passes, production smoke verifies the real `/warehouse/query` and inbound/outbound screens, and business acceptance confirms the full SKU/product-code workflow.

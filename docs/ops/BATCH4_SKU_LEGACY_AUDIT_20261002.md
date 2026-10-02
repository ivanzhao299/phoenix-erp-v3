# Batch 4 SKU legacy audit (2026-10-02)

## Scope and evidence

Static read-only audit of `apps/api/src` and `apps/web/src` (sales-v2, WMS/inventory, store POS/replenishment, analytics/traceability, exports, tests/fixtures). A disposable database was not available: `psql` is not installed in this worktree environment, and no local DB connection was used. Therefore row counts are **UNAVAILABLE (DB source unavailable)**; no write query was executed.

Canonical identity is `product_skus.sku_code`. `product_code` is the SPU/product legacy fallback; `material_code` is a separate inventory identity.

## Table-level classification

| table | SKU columns / observed shape | TOTAL | NATIVE (sku only) | LEGACY (product only) | MIXED (both) | INVALID | NULL | classification |
|---|---|---:|---:|---:|---:|---:|---:|---|
| `inv_batches` | `sku_code`, `product_code`, `material_code` | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | MIXED runtime; product-only historical rows possible |
| `inv_ledger` | no SKU identity column in baseline; links by `batch_no` | unavailable | n/a | n/a | n/a | unavailable | unavailable | legacy indirect |
| `wms_inbound_items` | baseline DDL has `product_code` only (`generic-crud.service.ts:1366-1383`); newer service accepts SKU and writes inv_batches | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | LEGACY schema / compatibility path |
| `wms_outbound_items` | baseline DDL has `product_code` only (`generic-crud.service.ts:1394-1405`) | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | LEGACY schema / compatibility path |
| `sal_order_items` | `product_code` required, `sku_code` nullable (`sales-v2/entities/sal-order-item.entity.ts:33,88-90`) | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | MIXED; old orders legitimately SKU NULL |
| `sal_return_items` | `product_code` required, `sku_code` nullable (`sales-v2/entities/sal-return-item.entity.ts:37,81`) | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | MIXED |
| `sal_price_items` | runtime queries join both product/SKU; entity comments record missing SKU columns (`sales-v2/entities/sal-price-item.entity.ts:20-33`) | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | MIXED/legacy compatibility |
| `product_skus` | canonical `sku_code`, parent `product_code` | unavailable | unavailable | n/a | n/a | unavailable | unavailable | NATIVE master |

Counts must be filled by a read-only DB run using per-table `COUNT(*)` and predicates `sku_code IS [NOT] NULL`, `product_code IS [NOT] NULL`, and invalid orphan checks against `product_skus`.

## LEGACY_READ_PATHS

- WMS and generic CRUD resolve an item by `COALESCE(sku_code, product_code, material_code)` and join both masters (`apps/api/src/modules/generic-crud/generic-crud.service.ts:2498-2571`).
- WMS inventory listing joins `product_skus` on `b.sku_code` and `mst_products` on `b.product_code` (`apps/api/src/modules/wms/wms.service.ts:1360-1410`).
- WMS outbound deduction explicitly falls back to `product_code` when no SKU selector is supplied (`wms.service.ts:783-805`, `1194-1210`).
- Quality search/backward traceability searches `inv_batches.product_code` and displays product fallback (`quality.service.ts:111-133`; web `quality/backward/page.tsx:20-32`).
- Terminal stock lookup selects `product_code` without SKU (`terminal.service.ts:60-76`).
- Store inventory UI renders `sku_code || product_code` (`apps/web/src/app/(admin)/store/inventory/page.tsx:21-30`).
- Sales localized display contracts require `item.sku_code ?? item.product_code` fallback (`apps/web/src/__tests__/sales-localized-name-display.contract.test.ts:26-28`).
- Analytics and traceability aggregate joins continue to group by `product_code` for legacy rows (`sales-analytics.service.ts:125,311-326`; `data-quality/services/traceability-health.service.ts:38-80`).

## LEGACY_WRITE_PATHS

- `wms_inbound_items` and `wms_outbound_items` generic table definitions persist `product_code` only (`generic-crud.service.ts:1366-1405`); these are compatibility writes even when request carries SKU.
- WMS canonical writes persist both fields when available, but preserve existing non-null values with `COALESCE` (`wms.service.ts:493-542,641-668`), so product-only batches remain valid.
- WMS transfer/adjustment and packaging writes copy `snapshot.product_code` and nullable `snapshot.sku_code` (`wms.service.ts:1660-1705,1902-1917`).
- Farm medicine and egg services create/search batches by `product_code` (`farm-medicine.service.ts:174-232`; `farm-egg.service.ts:58-86`).
- Sales order/return entities require product code while SKU is optional, preserving old-order writes (`sal-order-item.entity.ts:33,88-90`; `sal-return-item.entity.ts:37,81`).
- Chanjet WMS bridge maps external `productCode` to ERP `product_code` and may map SKU separately (`chanjet-wms-readonly.contract.ts:152,225`; `chanjet-wms-bridge.service.ts:1085-1093`).

## Compatibility callers and runtime vs historical/dead candidates

**Runtime callers:** WMS service selectors, store POS/replenishment, quality/traceability, terminal, sales order/return, analytics, Chanjet bridge. These paths must retain product fallback until all producers supply canonical SKU.

**Historical/dead candidates:** generic-crud bootstrap DDL for `wms_*_items` (schema lacks SKU), old terminal product-only lookup, and farm medicine/egg product-only batches. They are not safe to delete: existing rows and APIs still depend on them. Locale strings mentioning “manual product code” are UI evidence of an intentional compatibility mode, not proof of dead code.

## Backfill / migration requirement

1. Inventory a read-only snapshot of all rows in the tables above; classify `product_code` rows by joining `product_skus.product_code` and (where possible) grade/spec attributes.
2. Backfill only deterministic one-to-one product→SKU mappings; leave ambiguous products NULL and produce an exception report.
3. Add SKU columns to `wms_inbound_items`/`wms_outbound_items` through a TypeORM migration under `apps/api/src/database/migrations/`; do not edit frozen SQL directories.
4. Update import/Chanjet and generic CRUD writes to persist canonical SKU, then monitor legacy product-only rate before changing reads.
5. Re-run counts and orphan checks; retain compatibility reads until product-only active rows reach zero and historical/report consumers are migrated.

## SAFE_TO_RETIRE

**NO (current evidence).** Product-code fallback is active in WMS deduction, terminal lookup, quality/traceability, sales entities, analytics, and external Chanjet mapping. Retirement is safe only after the read-only count proves zero active product-only rows, all inbound/outbound schemas carry SKU, all compatibility callers are migrated, and a staged backfill exception report is empty/approved.

## Verification performed

- Static search completed with `rg` over API/Web source, migrations, tests and fixtures.
- Database aggregate counts not run because `psql` is unavailable and no disposable DB endpoint was present.
- No runtime code, schema, data, deployment, or other worktree was modified.

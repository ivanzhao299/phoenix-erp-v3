# R2 FK ORDER CORRECTION

The first R2 dry-run stopped and rolled back at `sal_store_sales` because the inherited R0 order placed `store_sale_allocations` after its parent. The database remained unchanged.

R2 now uses the live FK topology with deduplicated non-self edges and child-before-parent ordering. The corrected order places:

```text
sal_store_settlement_reconciliations
→ sal_store_sale_tenders
→ store_sale_allocations / store_sale_adjustments / price-drift facts
→ sal_store_sales
```

and:

```text
pkg_packing_code_claims / events / operations / boxes
→ pkg_packing_records
```

The two nullable self references are still handled separately before deletion. No KEEP master rows are changed. The failed attempt produced no persisted business mutation; the durable Chanjet HOLD update remains the only maintenance control change.

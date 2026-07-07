# BUG-20260707-0004 Orchestrator Repair Report

## Summary

- Bug: `tangzhiwen` 库存查询无数据
- Production evidence: `tangzhiwen` has company scope `COMP-LAO-AGRI`; production inventory has 225 `inv_batches` rows and 806277.950 total quantity.
- Root cause: the warehouse query page still used the generic CRUD data table for `inv_batches`. That path could mask permission or scope failures as an empty table and did not use the WMS inventory endpoint designed for `MENU_WMS_VIEW` and warehouse DataScope.
- Fix: the page now calls `/api/inventory/batches` first, falls back to CRUD only if the dedicated endpoint is not present, shows explicit 403 guidance, and renders a dedicated inventory table with search and summary cards.

## Changed Files

- `apps/web/src/app/(admin)/warehouse/query/page.tsx`

## Validation

- Web typecheck: PASS
- Production DB read-only evidence: PASS
- Backend touched: no
- DB write: no
- Migration: no
- Deploy: pending current batch deployment

## Conclusion

PASS WITH CONDITIONS. The UI now uses the correct inventory endpoint and makes authorization/scope issues visible instead of silently showing an empty list.

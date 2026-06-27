# WMS DataScope Write Scope Remediation - 2026-06-26

## Goal

Close the remaining P0/P1 inventory and WMS write-scope gap so users cannot mutate inventory outside their allowed warehouse scope.

## Scope

This batch focused on server-side WMS write paths:

- inbound confirmation
- purchase receipt inventory posting
- outbound shipment batch deduction
- receiving order confirmation
- inventory transfer
- stocktake approval
- loss approval
- atomic inventory increment/decrement service

## Findings

- WMS controllers already use `MenuGuard` and `DataScopeGuard`.
- WMS read lists already apply warehouse filters in several places.
- Several write paths accepted `warehouse_code` or mutated `inv_batches` by `batch_no` without re-checking that the affected warehouse is inside `dataScope.allowedWarehouseCodes`.
- The reusable `DataScopeHelper.assertWritableWarehouse` pattern existed, but WMS services did not consistently enforce the same semantics.

## Remediation

- Added `assertWritableWarehouse` to `WmsService`.
- Added `assertWritableWarehouse` to `InventoryService`.
- Enforced warehouse write checks for:
  - task-level inbound warehouse
  - inbound item warehouse override
  - receipt posting warehouse
  - outbound batch warehouse
  - receiving order warehouse
  - transfer source and target warehouses
  - transfer source batch warehouse
  - stocktake document warehouse
  - stocktake batch warehouse
  - loss document warehouse
  - loss batch warehouse
  - atomic inventory decrement warehouse
  - atomic inventory increment warehouse
- Added `scripts/ci/check-wms-datascope-writes.mjs`.
- Added the WMS DataScope write gate to `scripts/ci/check-w5-closeout-gate.mjs`.

## Compatibility Semantics

- Global DataScope users are allowed.
- If a user has no configured warehouse scope, existing company/project DataScope behavior is preserved to avoid breaking roles that have not yet been warehouse-scoped.
- If `allowedWarehouseCodes` is configured, WMS writes must target a permitted warehouse.

## Validation

Required validation:

- API typecheck.
- Web typecheck.
- `node scripts/ci/check-wms-datascope-writes.mjs`.
- W5 closeout static gate.
- Production API/Web smoke after deploy.

## Risk

LOW/MEDIUM.

The change is deliberately limited to WMS write authorization checks. It does not change table shape, migrations, frontend UI, or inventory arithmetic.

## Not Done

- No schema change.
- No migration.
- No data repair.
- No frontend page change.
- No broad role matrix rewrite.

## Conclusion

GO WITH CONDITIONS.

Remaining condition: complete production role-by-role warehouse scope evidence and proceed to approval action flow hardening.

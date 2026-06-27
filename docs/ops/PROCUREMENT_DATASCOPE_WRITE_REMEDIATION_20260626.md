# Procurement DataScope Write Remediation - 2026-06-26

## Goal

Close the next P0 production-readiness gap after menu atomization: procurement and related finance actions must not rely on frontend visibility alone. All high-frequency procurement write paths now enforce server-side company/project/warehouse DataScope before creating records or changing state.

## Scope Completed

### Shared DataScope Helper

Added strict write guards to `DataScopeHelper`:

- `assertWritableOwnership()`
  - Requires non-global users to write only within allowed company scope.
  - Requires project-scoped users to write only within allowed project scope.
  - Rejects writes with missing company ownership for scoped users.
- `assertWritableWarehouse()`
  - Enforces warehouse scope when a user has warehouse restrictions configured.
  - Keeps legacy company/project-only users unaffected when no warehouse list is configured.

### Procurement Request

Updated `RequestsService`:

- create
- update
- submit
- approve
- reject
- cancel
- approval-log read

All now validate the request company/project ownership before mutation or sensitive subresource read.

### Procurement Order

Updated `OrdersService`:

- create
- convert PR to PO
- update
- submit
- approve
- reject
- cancel
- approval-log read
- AP ledger read

PR to PO conversion now validates the source PR ownership before generating a downstream PO.

### Procurement Receipt

Updated `ReceiptsService`:

- create
- confirm
- cancel

Receipt writes now validate:

- PO company/project ownership.
- Receipt warehouse scope when warehouse restrictions exist.

### Procurement Payment

Updated `PaymentsService`:

- create
- update
- submit
- approve
- pay
- cancel
- payment allocation read
- payment allocation write rows

Payment allocations now validate each allocation company/project so a valid payment header cannot be used to attach AP entries from another data domain.

### Procurement Shipment

Updated `ShipmentsService`:

- create
- update
- ready
- dispatch
- customs
- arrive
- cancel

All state transitions now validate shipment ownership before mutation.

### Procurement Master Data

Updated:

- `ProjectsService.create()`
- `SuppliersService.create()`
- `ShareholderFundsService.create()/submit()/cancel()`

New project, supplier, and shareholder-fund records can no longer be created or advanced outside the user's DataScope.

## CI Gate Added

Added `scripts/ci/check-procurement-datascope-writes.mjs`.

The gate verifies that high-frequency procurement services retain required ownership checks for write actions and sensitive subresource reads.

It is now wired into:

- `scripts/ci/check-w5-closeout-gate.mjs`

## Validation

- API typecheck: PASS
- Procurement DataScope write gate: PASS
- W5 closeout gate: PASS

Additional full validation is run before commit/deploy.

## Production Impact

This is a backend security hardening change. It does not change schema and does not add migrations.

Expected behavior:

- Authorized users continue to use procurement workflows normally.
- Cross-company/project/warehouse write attempts now fail with `403 Forbidden`.
- Unauthorized submenu visibility remains handled by prior menu atomization; this batch adds backend enforcement for data ownership.

## Residual Risk

- Existing records with missing company/project ownership may be rejected for scoped users during writes. This is intentional for production safety.
- Some legacy/global roles may still see broad menus if role permissions are intentionally broad; the next batch should run targeted role matrix audit against pilot users.

## Next Recommended Batch

1. Role matrix pilot audit for Wang Lejin and high-frequency procurement/finance users.
2. Approval action flow hardening: PC + mobile "同意 / 不同意 / 转交审批" consistency and completed-approval crash regression.
3. Inventory/WMS route-level write DataScope review beyond the currently scoped warehouse paths.

# BUG-20260709-0002 A3 Backend Critical Path Report

## Source

- Bug: `BUG-20260709-0002`
- Task: `BUGTASK-20260709-0002`
- Agent: `A3-Backend-Critical-Path`
- Route: `/warehouse/inbound`
- Issue: `库存业务链路没有闭环`

## Diagnosis

Dry-run/source diagnosis found the backend critical path for inbound completion:

- `/warehouse/inbound` stores inbound rows in `wms_inbound`.
- Completed inbound rows must be confirmed through `WmsService.confirmInbound()`.
- `WmsService.confirmInbound()` is the canonical path that writes `inv_batches` and `inv_ledger`.

The controller path already routes `wms_inbound` status transitions to `COMPLETED` through `WmsService.confirmInbound()` instead of a naked Generic CRUD status update. The remaining backend gap was inside `confirmInbound()`: a payload with no positive actual/broken quantity, or with an effective quantity but no product/material code, could pass validation, update `wms_inbound.status` to `COMPLETED`, skip all inventory posting loops, and return success without `inv_batches` / `inv_ledger` rows. That is a backend-owned way for the business chain to appear completed while inventory is not closed.

No database writes, migrations, schema/entity/table/column changes, deploys, pushes, or task-board mutations were performed.

## Changed Files

- `apps/api/src/modules/wms/wms.service.ts`
  - Rejects inbound confirmation before opening the transaction when no stock line can be posted.
  - Rejects effective inbound lines that lack `product_code`.
  - Prevents `COMPLETED` status changes that would not produce inventory facts.
- `apps/api/src/modules/wms/wms.service.spec.ts`
  - Adds regression coverage for zero-quantity confirmation and missing product/material code.
- `apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts`
  - Adds regression coverage that inbound detail edits are saved before WMS confirmation, while `status=COMPLETED` is not written directly by Generic CRUD.

## Validation

- Focused regression:
  - Command: `cd apps/api && pnpm test -- generic-crud.controller.spec.ts wms.service.spec.ts --runInBand`
  - Result: PASS, `2 passed`, `15 passed`.
- API typecheck:
  - Command: `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - Result: PASS.

## Result

PASS WITH CONDITIONS.

Local backend repair and validation are complete for the A3-owned critical path. This is not a production resolved claim until CI/CD passes, staging or production smoke verifies `/warehouse/inbound` completion creates visible inventory facts, and the business reporter accepts the workflow.

# BUGTASK-20260708-0003 A3 Backend Report

Date: 2026-07-12 23:02 CST

## Source

- Bug: `BUG-20260708-0003`
- Repair task: `BUGTASK-20260708-0003`
- Agent: `A3-Backend-Critical-Path`
- Route: `/procurement2/orders`
- Issue: 物流运单没法关联采购订单
- Acceptance criteria: 物流运单可以关联采购订单

## Diagnosis

Backend evidence showed procurement shipments already have nullable linkage columns on `prc2_shipments`:

- `po_id`
- `po_no`

The backend create/update path did not resolve or validate the purchase order association. `ShipmentsService.create()` and `ShipmentsService.update()` copied `dto.poId` and `dto.poNo` directly into the shipment. `CreateShipmentDto` also required both fields, so a client that selected a purchase order by only one stable key, such as `poNo`, could fail validation or persist an incomplete association.

Root cause: shipment PO linkage was treated as raw payload passthrough instead of a backend-owned relationship resolution step.

## Changed Files

- `apps/api/src/modules/procurement-v2/dto/create-shipment.dto.ts`
  - Made `poId` and `poNo` optional so the API can accept either identifier for association.
- `apps/api/src/modules/procurement-v2/services/shipments.service.ts`
  - Added purchase order resolution by `poId` or `poNo`.
  - Backfills the missing counterpart (`po_id` or `po_no`) from the matched PO.
  - Backfills company/project ownership fields from the matched PO when the shipment payload omits them.
  - Rejects mismatched `poId`/`poNo` and mismatched company/project context.
  - Keeps DataScope write checks on both the referenced purchase order and final shipment ownership.
- `apps/api/src/modules/procurement-v2/services/shipments.service.spec.ts`
  - Added focused regression coverage for create/update linkage, mismatch rejection, and missing PO handling.

No web files, migrations, schema, entity, table, or column changes were made.

## Validation

- `pnpm test -- shipments.service.spec.ts --runInBand`
  - PASS: 1 suite, 4 tests.
- `./node_modules/.bin/tsc --noEmit`
  - PASS: 0 TypeScript errors.

No database writes, migration execution, deploy, push, or task board mutation were performed.

## Result

`PASS WITH CONDITIONS`

Implementation-side backend repair is complete and locally validated. Do not claim production resolution until CI/CD passes, the release is deployed through the approved path, production smoke confirms the API behavior, and business acceptance verifies that logistics waybills can associate purchase orders in the live workflow.

# BUG-20260708-0003 A4 Frontend UAT Smoke Report

## Result

PASS WITH CONDITIONS

GO for CI/staging validation. Do not mark the source bug resolved until CI/CD, production smoke, and business acceptance confirm the workflow in the deployed environment.

## Source

- Bug: BUG-20260708-0003
- Task: BUGTASK-20260708-0003
- Route: `/procurement2/orders`
- Acceptance: 物流运单可以关联采购订单

## Diagnosis

The frontend had a workflow gap. `/procurement2/shipments` could create a shipment only by manually typing both `poId` and `poNo`; `/procurement2/orders` had no action to start shipment creation from the selected purchase order. Users seeing a PO number in the order list still had no reliable way to pass the internal PO id into a logistics waybill.

No frontend evidence required schema, migration, entity, or API changes.

## Changed Files

- `apps/web/src/app/(admin)/procurement2/orders/page.tsx`
  - Added a `MENU_PRC2_SHIPMENT:C` gated `创建运单` action for shipment-creatable PO statuses.
  - The action links to `/procurement2/shipments?create=1&poId=...&poNo=...&shipmentType=...`.
  - Added the same action inside the PO detail drawer.

- `apps/web/src/app/(admin)/procurement2/shipments/page.tsx`
  - Reads the local query params and auto-opens the new shipment drawer.
  - Prefills `poId` and `poNo`.
  - Locks the prefilled PO fields as read-only so the created shipment remains associated with the selected PO.
  - Gates direct URL prefill and the new shipment button with `MENU_PRC2_SHIPMENT:C`.
  - Keeps existing loading, empty, and error states.

- `apps/web/src/__tests__/procurement-shipments-layout.test.ts`
  - Added focused regression coverage for the order-to-shipment prefill path and locked PO fields.

## Validation

- `pnpm --filter web test -- src/__tests__/procurement-shipments-layout.test.ts` PASS
- `cd apps/web && ./node_modules/.bin/tsc --noEmit` PASS
- `git diff --check -- apps/web/src/app/(admin)/procurement2/orders/page.tsx apps/web/src/app/(admin)/procurement2/shipments/page.tsx apps/web/src/__tests__/procurement-shipments-layout.test.ts` PASS

## UAT Notes

- Desktop behavior checked by source and focused test: approved/active procurement orders now expose a permission-gated shipment action, and the shipment drawer receives locked PO values.
- Mobile behavior checked by existing shipment drawer CSS and focused test: the shipment form still switches to a single-column layout under `@media (max-width: 768px)`.
- Local browser smoke was attempted but blocked by the execution sandbox: `next dev` failed with `listen EPERM` on both `0.0.0.0:3000` and `127.0.0.1:3001`.
- No production deploy, database write, migration execution, merge, or push was performed.

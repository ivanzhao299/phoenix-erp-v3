# BUG-20260708-0003 A4 Frontend UAT Smoke

## Result

PASS WITH CONDITIONS

No production-resolution claim is made. Final closure still requires CI/CD, production smoke, and business acceptance.

## Source

- Source bug: BUG-20260708-0003
- Source repair task: BUGTASK-20260708-0003
- Route: `/procurement2/orders`
- Acceptance: 物流运单可以关联采购订单
- Assigned agent: A4-Frontend-UAT-Smoke

## Diagnosis

The frontend path for associating a logistics shipment with a purchase order is present in the current baseline:

- `/procurement2/orders` gates the shipment action through `usePermission("MENU_PRC2_SHIPMENT")`.
- Purchase orders in shipment-creatable statuses build a `/procurement2/shipments?create=1&poId=...&poNo=...` link.
- The order list action column and order detail drawer both expose the create-shipment entry when allowed.
- `/procurement2/shipments` reads the link parameters, opens the new shipment drawer, prefills `poId` and `poNo`, and locks both PO fields.
- Shipment creation validates required PO fields before POSTing to `/api/v2/procurement/shipments`.

Root cause class: frontend discoverability and workflow wiring. The user could view procurement orders, but the PO-to-shipment create path needed an explicit, RBAC-gated frontend entry and locked PO prefill.

## Changed Files

- `apps/web/src/__tests__/procurement-shipments-layout.test.ts`
  - Added focused regression assertions for creatable PO statuses.
  - Added coverage for the order-detail drawer shipment entry.
  - Added coverage for shipment create PO validation and loading/empty list states.
- `docs/ops/bug-20260708-0003-a4-frontend-uat-smoke.md`
  - This report.

No API, migration, schema, entity, table, column, database, deployment, push, or production command was touched.

## Existing Frontend Files Verified

- `apps/web/src/app/(admin)/procurement2/orders/page.tsx`
- `apps/web/src/app/(admin)/procurement2/shipments/page.tsx`
- `apps/web/src/app/(admin)/procurement2/shipments/shipments.module.css`
- `apps/web/src/__tests__/procurement-shipments-layout.test.ts`

## Verification

- `pnpm --filter web test -- src/__tests__/procurement-shipments-layout.test.ts`
  - PASS: 1 file, 4 tests.
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 errors.
- `cd apps/web && ./node_modules/.bin/next build --webpack --debug-build-paths 'src/app/(admin)/procurement2/orders/page.tsx,src/app/(admin)/procurement2/shipments/page.tsx' --experimental-build-mode compile`
  - PASS: target route compile succeeded.

## Desktop And Mobile Check

- Desktop behavior checked by source and route compile: order list and order detail drawer both preserve the PO-to-shipment entry when `MENU_PRC2_SHIPMENT:C` or ROLE_ADMIN is present.
- Mobile behavior checked by regression coverage and CSS inspection: shipment drawer uses a page-scoped form layout, actions are in the drawer footer, and `@media (max-width: 768px)` switches the form grid to a single column.
- A live localhost browser smoke was attempted but blocked by the execution sandbox: `next dev -H 127.0.0.1 -p 3000` failed with `listen EPERM: operation not permitted 127.0.0.1:3000`.

## Permission, Empty, Loading, Error States

- Permission visibility preserved: create shipment is gated by `shipmentPerm.canCreate`; direct URL prefill also returns early without create permission.
- Loading and empty states preserved on the shipments list and covered by focused regression assertions.
- Error/validation state preserved: shipment creation blocks and shows `请填写关联PO` when `poId` or `poNo` is missing.
- Attachment ACL is not involved in this flow and was not modified.

## Conditions

- CI/CD was not run in this task.
- Production smoke was not run.
- Business acceptance was not performed.
- Local live browser smoke could not run because the sandbox disallowed binding a localhost port.

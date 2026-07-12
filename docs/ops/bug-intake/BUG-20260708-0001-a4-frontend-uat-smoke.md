# BUG-20260708-0001 A4 Frontend UAT Smoke

## Source

- Source bug: BUG-20260708-0001
- Source repair task: BUGTASK-20260708-0001
- Assigned agent: A4-Frontend-UAT-Smoke
- Route: `/warehouse/query`
- Related frontend route inspected: `/warehouse/inbound`

## Diagnosis

The admin inbound page listed and created `wms_inbound` rows, but its pending-row action only called generic CRUD update with `status: "COMPLETED"`.

That bypassed the WMS inbound confirmation endpoint (`POST /api/inbound/confirm`) used by the terminal flow. The WMS endpoint is the path that writes `inv_batches` and `inv_ledger`; `/warehouse/query` reads inventory batches, so a status-only inbound update could not make the newly inbound item appear in inventory query.

## Changed Files

- `apps/web/src/app/(admin)/warehouse/inbound/page.tsx`
  - Replaced status-only approve with WMS confirm request.
  - Builds a confirm payload from the admin inbound row (`task_no`, `item`/`product_code`, `qty`, warehouse/location when present).
  - Keeps visible error feedback in the confirm dialog when data is incomplete or the API rejects the request.
  - Updates the action copy from `审核` to `确认入库`.
  - Keeps the inventory-query handoff and searches by the same product/item code used for the confirm payload.
- `apps/web/src/lib/warehouse-inbound.ts`
  - Added pure helpers for inbound confirm payload construction and query keyword selection.
- `apps/web/src/lib/warehouse-inbound.test.ts`
  - Added focused regression coverage for payload construction, invalid rows, and query keyword behavior.

## Verification

- `pnpm --filter web test -- src/lib/warehouse-inbound.test.ts src/lib/warehouse-query.test.ts`
  - PASS: 2 files, 9 tests.
- `pnpm --filter web typecheck`
  - PASS: `tsc --noEmit`.
- `git diff --check -- apps/web/src/app/(admin)/warehouse/inbound/page.tsx apps/web/src/lib/warehouse-inbound.ts apps/web/src/lib/warehouse-inbound.test.ts`
  - PASS.

## Desktop And Mobile Check

- Static UI review:
  - `/warehouse/inbound` table action remains inside the existing flex action group and uses existing design-system `actionPill` styling.
  - Confirm dialog keeps the existing responsive mobile rule from `ConfirmDialog` (`max-width: 640px` stacks actions full-width).
  - `/warehouse/query` table layout and mobile horizontal scrolling were not changed.
- Browser smoke condition:
  - Local Next dev server could not be started in this sandbox. Both `0.0.0.0:3014` and `127.0.0.1:3014` failed with `listen EPERM`.
  - No production/staging browser smoke was performed.

## Permissions And States

- RBAC/DataScope backend enforcement is preserved by using the existing WMS confirm endpoint and existing authenticated `request` client.
- The frontend action remains permission-gated by existing inbound permissions, with create permission also accepted because the confirm endpoint requires `MENU_WMS_INOUT:C`.
- Loading/error behavior is preserved:
  - confirm button uses dialog loading state;
  - invalid row data shows an inline dialog error;
  - API rejection/403/500 remains visible through the dialog error/global API handling.
- Empty/loading/error behavior on `/warehouse/query` was not changed.
- Attachment ACL was not changed.

## Result

PASS WITH CONDITIONS.

The frontend now calls the inventory-writing WMS confirmation path instead of a metadata-only CRUD status update. This is not a final resolved claim until CI/CD, production smoke, and business acceptance confirm that real inbound rows produce visible `/warehouse/query` inventory under the reporter's permissions.

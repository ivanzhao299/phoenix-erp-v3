# BUGTASK-20260707-0002 A4 Frontend Report

## Conclusion

PASS WITH CONDITIONS. The frontend permission/request plan is implemented and locally validated. CI/CD, production smoke with a VIEW-only user, and administrator business acceptance are still required before resolution.

## Root Cause

The warehouse page and the backend previously disagreed on the read permission for `wms_zones`, `wms_inbound`, and `wms_outbound`. The backend baseline now allows read-only WMS Generic CRUD access with `MENU_WMS_VIEW:V`, while mutations remain protected by `MENU_WMS_INOUT`. The page now mirrors that rule and suppresses only non-blocking global toasts while showing an inline load warning.

## Changed Files

- `apps/web/src/app/(admin)/warehouse/page.tsx`
- `apps/web/src/app/(admin)/warehouse/warehouse.module.css`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/lib/warehouse-dashboard-access.ts`
- `apps/web/src/lib/warehouse-dashboard-access.test.ts`

## Permission Contract

- `MENU_WMS_VIEW:V`: page visible and all read-only dashboard datasets load.
- `MENU_WMS_INOUT`: remains available for operation controls; it is not required merely to read the overview.
- No `MENU_WMS_VIEW:V`: no warehouse dashboard requests are emitted and the sidebar/page gate remains fail-closed.

## Verification

- Focused Vitest permission plan: required before integration.
- Web typecheck: required before integration.
- W5 static gate: required before integration.

## Safety

- Backend, migration, schema, and database writes: None.
- Push/deploy by A4: None.
- Resolution claimed: No.

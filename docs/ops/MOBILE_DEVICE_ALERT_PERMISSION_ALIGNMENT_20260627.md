# Mobile Device Alert Permission Alignment - 2026-06-27

## Objective

Remove a frontend permission drift where the mobile dashboard showed device alert content to users with broad farm permissions or legacy `MENU_IOT`, while backend device endpoints are now guarded by atomic `MENU_DEVICE_MONITOR`.

## Change

- `apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`
  - `showAlerts` now requires `MENU_DEVICE_MONITOR:V`.
  - The mobile dashboard no longer fetches or displays device alerts solely because a user has `MENU_FARM_DATA` or legacy `MENU_IOT`.

- `scripts/ci/check-menu-permission-atomicity.mjs`
  - Added a regression check so mobile device alerts cannot drift back to broad farm or legacy IoT permissions.

## User Impact

Users without device monitoring authority will not see device alert cards or trigger alert API requests from the mobile dashboard. Users with `MENU_DEVICE_MONITOR:V` keep normal device alert visibility.

## Validation

Pending in this batch:

- Web typecheck
- API typecheck
- Menu permission atomicity gate
- W5 closeout gate

## Conclusion

GO WITH CONDITIONS. This closes one frontend source of "visible but unauthorized" menu/card exposure in the mobile dashboard.

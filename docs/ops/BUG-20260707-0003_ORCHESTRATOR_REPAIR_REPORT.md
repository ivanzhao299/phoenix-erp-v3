# BUG-20260707-0003 Orchestrator Repair Report

## Summary

- Bug: 打开运营工作台报错 `[403] MENU_PERMISSION_DENIED`
- Root cause: the home dashboard requested the optional IoT device summary whenever a user had breeding data permission. Device monitoring is protected by `MENU_DEVICE_MONITOR`, so users without that menu could receive a 403 from an optional KPI request.
- Fix: the home dashboard now only requests `/api/v3/iot/devices/all-summary` when the user has `MENU_DEVICE_MONITOR:V`; the breeding daily KPI request is also silent so optional KPI failures do not break the workbench.

## Changed Files

- `apps/web/src/app/(admin)/home/page.tsx`

## Validation

- Web typecheck: PASS
- Business code touched: yes, approved frontend-only repair
- Backend touched: no
- DB write: no
- Migration: no
- Deploy: pending current batch deployment

## Conclusion

PASS WITH CONDITIONS. The dashboard no longer surfaces optional IoT permission failures as a page-level 403. Users without device-monitor permission still do not receive device data.

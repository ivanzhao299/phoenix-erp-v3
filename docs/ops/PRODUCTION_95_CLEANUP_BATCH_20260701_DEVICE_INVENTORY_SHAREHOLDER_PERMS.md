# Production 95 Cleanup Batch 20260701 - Device, Inventory, Shareholder Permissions

## Scope

This batch addresses three user-reported production issues:

1. PC device monitoring overview showed mapped houses but no live data explanation.
2. Inventory turnover analysis page layout degraded into cramped, overlapping content.
3. Shareholder capital flow page exposed edit/import/confirm/reversal actions to non-finance shareholder users.

No database migration, seed, production deploy script, or schema/entity/table/column change was added in this batch.

## Device Monitoring Root Cause

The device page did not lose house mappings. The confusing display came from a semantic change plus missing PC diagnostics:

- `c9378f64 fix: 设备监控总览在线统计加陈旧过滤（手机端聚合修正）` tightened the online rule so stale snapshots are no longer counted as live sensors.
- `0539f248`, `05d5bf54`, `6af407d7`, `a243d88a`, and `a2f81e50` mostly added or stabilized mobile diagnostics and shared IoT backend diagnostics.
- The PC page at `apps/web/src/app/(admin)/breeding/device/page.tsx` still swallowed loading errors with `catch {}` and only rendered `暂无采集数据`.

Result: the page could show `0/7` effectively, but without explaining that the 7 houses were still mapped and the live count was zero because no recent valid snapshots existed.

## Device Monitoring Fix

Updated `apps/web/src/app/(admin)/breeding/device/page.tsx`:

- Shows `在线鸡舍 0/7` instead of presenting active houses as if they were the access count.
- Adds a PC diagnostic panel when live data is missing.
- Calls `/api/v3/iot/devices/sync-health` for deterministic chain diagnosis.
- Displays `all-summary` and `sync-health` HTTP/latency status.
- Stops swallowing fetch failures silently.
- Adds a copyable diagnostic snapshot for operations handoff.

## Inventory Turnover Page Fix

Updated `apps/web/src/app/(admin)/analytics/inventory/page.tsx`:

- Replaced unreliable utility-class layout with stable inline token-based layout.
- Rebuilt KPI cards, grade distribution, and recent batch table spacing.
- Added fixed table padding, min width, proper card gutters, and responsive grid tracks.
- Prevented title/value/table text from overlapping on production browsers where utility classes were not applied.

## Shareholder Capital Permission Fix

Updated frontend:

- `apps/web/src/app/(admin)/shareholders/capital/page.tsx`
- `apps/web/src/app/(admin)/shareholders/capital/import/page.tsx`

Behavior:

- Non-finance shareholder users can view authorized capital flow records only.
- Import, create, submit, confirm, amount-entry, attachment maintenance, and reversal actions are hidden/blocked for non-finance users.
- Direct navigation to the import page shows a read-only permission notice.

Updated backend:

- `apps/api/src/modules/shareholder/controllers/shareholder.controller.ts`
- `apps/api/src/modules/shareholder/services/shareholder.service.ts`
- `apps/api/src/modules/finance-v2/services/shareholder-contributions.service.ts`

Behavior:

- Legacy `/api/shareholders/capital` high-risk write actions now require finance/admin role membership in service layer.
- Finance-v2 shareholder contribution high-risk write actions now also require finance/admin role membership.
- This avoids relying only on frontend hiding and protects against direct API calls if a shareholder role is misconfigured with edit menu bits.

Allowed finance/admin roles:

- `ROLE_ADMIN`
- `ROLE_FIN_CFO`
- `ROLE_FIN_ACCT`
- `ROLE_FIN_COST`
- `ROLE_GROUP_FINANCE`
- `ROLE_HQ_FINANCE`
- `ROLE_FACTORY_ACCOUNTANT`
- `ROLE_CASHIER`
- `ROLE_CASH`
- `ROLE_TREASURY_MANAGER`
- `ROLE_MENGSAI_DONGPENG_TREASURER`

## Validation

Local validation completed:

- API typecheck: PASS
- Web typecheck: PASS
- i18n key gate: PASS, zh/en/lo all aligned
- W5 closeout static gate: PASS

## Risk Notes

- Device monitoring still depends on real IoT gateway snapshots. This fix does not fabricate live data; it makes stale/offline state explicit and diagnosable.
- Inventory page fix is UI-only and keeps the same `/api/inventory/batches/summary` data source.
- Shareholder capital write restriction may block previously misconfigured non-finance users who had edit bits. This is intentional for capital amount and reversal safety.

## Conclusion

GO WITH CONDITIONS.

The reported pages are corrected at code level, high-risk shareholder capital actions are tightened, and local gates pass. Next step is push to `main`, CI/CD deployment, and runtime smoke verification.

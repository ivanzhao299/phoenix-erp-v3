# BUGTASK-20260706-0002 A4 Frontend Report

## Conclusion

PASS WITH CONDITIONS. The frontend implementation and focused local validation pass. The bug must remain open until CI/CD, production route smoke, and administrator business acceptance pass.

## Root Cause

The `/home` KPI aggregator treated a present hen-report as proof that both feed and water totals existed. In production payloads, feed can be present while water is omitted, so the page converted the missing water value to zero and skipped the valid `brd_daily_logs.water_consumed` fallback. The earlier truthy checks also treated a recorded zero as missing.

## Changed Files

- `apps/web/src/app/(admin)/home/page.tsx`
- `apps/web/src/lib/home-farm-kpi.ts`
- `apps/web/src/lib/home-farm-kpi.test.ts`
- `docs/ops/BUGTASK-20260706-0002-A4-FRONTEND-REPORT.md`

## Behavior

- Feed precedence: hen-report total, daily log, IoT fallback.
- Water precedence: hen-report total when present, daily log, IoT fallback converted from tons to liters.
- Recorded zero remains a known zero.
- Existing `MENU_FARM_DATA` and `MENU_DEVICE_MONITOR` request/visibility gates are unchanged.

## Verification

- `vitest run src/lib/home-farm-kpi.test.ts`: PASS, 3/3.
- `tsc --noEmit`: PASS.
- `git diff --check`: PASS.

## Safety

- Backend changed: No.
- Database write or migration: No.
- Push or deploy by A4: No.
- Resolution claimed: No. CI/CD, production smoke, and business acceptance remain required.

# Production 95 Cleanup Batch - Dashboard KPI Semantics Repair

Date: 2026-07-01
Owner: Codex-Orchestrator
Scope: system dashboard KPI aggregation and presentation

## Objective

Fix the confusing system dashboard aggregate cards reported from production screenshots. The page should clearly explain what each card means, avoid mixed units, and avoid presenting empty operational data as broken UI.

## Root Cause

1. Dashboard cards mixed values and explanatory text in the `unit` field, for example `LAK · POS 收银` and `托 (可用库存)`.
2. The 7-day trend chart used POS transaction count multiplied by a constant as a placeholder for production volume. That made the chart look populated but semantically wrong.
3. Zero values had no explanatory copy, so normal states such as no POS receipts today or no current-scope inventory looked like missing data.
4. The chart used a single absolute axis for unrelated units: egg production, LAK receipts, and LAK farm sales.

## Changes

### Backend

File: `apps/api/src/modules/bff/bff.controller.ts`

- Dashboard KPI units are now clean:
  - eggs: `枚`
  - stock: `托`
  - POS receipts: `LAK`
  - farm direct sales: `LAK`
  - alerts: `条`
- The backend now queries 7-day egg production from `brd_daily_logs`.
- The chart no longer fabricates egg production from POS transaction count.
- Added dashboard `meta` fields for frontend explanation:
  - `todayLayRate`
  - `posTxnCount`
  - `stockAvailableTotal`
  - `farmSalesAmount`

### Frontend

File: `apps/web/src/app/(admin)/dashboard/_components/DashboardKPIs.tsx`

- Added zero-state explanations for each KPI.
- The 7-day chart now uses per-series relative height instead of one shared absolute axis across unrelated units.
- Y-axis labels now show relative percentage, avoiding false comparison between LAK and egg counts.
- Tooltips still expose exact values for each bar.

## Validation

| Command | Result |
|---|---|
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |
| `ALLOW_SECURITY_TOUCH=true ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` | PASS |

## Production Safety

| Item | Result |
|---|---|
| DB migration executed | No |
| DB write executed | No |
| Business code changed | Yes, approved dashboard BFF/UI cleanup |
| Deployment required | Yes, normal CI/CD |
| Push required | Yes |

## Conclusion

GO WITH CONDITIONS.

The system dashboard aggregate cards now have clearer business meaning. The remaining production-grade improvement is to align the dashboard data model with a formal KPI catalog and add authenticated visual smoke coverage for dashboard cards.

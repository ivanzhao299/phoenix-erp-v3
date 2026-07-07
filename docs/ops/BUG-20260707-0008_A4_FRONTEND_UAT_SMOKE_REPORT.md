# BUG-20260707-0008 A4 Frontend UAT Report

## Result

- Status: PASS WITH CONDITIONS
- Release gate: HOLD
- Reason: Frontend-only fix is implemented, but local TypeScript/UI smoke could not be executed because workspace binaries are unavailable in this worktree.

## Changed Files

- `apps/web/src/app/(admin)/breeding/page.tsx`
- `docs/ops/BUG-20260707-0008-a4-frontend-uat-report.md`

## Page / Component List

- Route: `/breeding`
- Component: `BreedingPage`
- KPI cards affected:
  - 今日产蛋
  - 今日死淘
  - 本周汇总 / 死淘累计

## UI/UX Adjustment Summary

- No visual layout, style, spacing, color, modal, drawer, or responsive structure changes.
- Fixed the data mapping behind existing KPI cards:
  - Replaced UTC `toISOString().slice(0, 10)` date derivation with local browser date.
  - Normalized API date/date-time values to `YYYY-MM-DD` before filtering.
  - Increased daily-log read limit from default to `limit=1000` to reduce dashboard undercount risk.
  - Changed dead-cull aggregation from `mortality_qty` only to `mortality_qty + elimination_qty`.

## Permission Visibility Notes

- No new frontend permission bypass or visibility shortcut was added.
- Existing requests still call protected API endpoints and therefore retain backend RBAC/DataScope behavior.
- No attachment ACL, audit, or write permission path was changed.

## Responsive Behavior Notes

- No DOM structure or CSS responsive behavior was changed.
- Existing desktop/mobile rendering should remain unchanged because only computed KPI values changed.

## UAT Smoke Result

- `pwd`: `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke`
- `git branch --show-current`: `w5-a4-frontend-uat-smoke`
- Initial `git status --short`: clean
- `git diff --check -- apps/web/src/app/(admin)/breeding/page.tsx`: PASS
- `rg "log_date ===|plan_date ===|toISOString\\(\\)\\.slice\\(0, 10\\)" apps/web/src/app/(admin)/breeding/page.tsx -n`: PASS, no matches
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: FAIL, `./node_modules/.bin/tsc` not found
- `pnpm --filter web exec tsc --noEmit`: FAIL, `Command "tsc" not found`
- Browser smoke for `/breeding`: NOT RUN, local `next`/workspace binaries unavailable

## A2 Security Review Required

- Not required for this A4 frontend-only patch.
- A2 review is recommended only if backend/API permission logic or DataScope behavior is changed by another agent.

## A1 Validation Required

- Required before release.
- Reason: TypeScript and browser UAT smoke were blocked locally by missing workspace binaries.

## Blockers

- Local dependency binaries are unavailable in this worktree:
  - `apps/web/node_modules/.bin/tsc` missing
  - root `node_modules/.bin` missing
  - `pnpm --filter web exec tsc --noEmit` cannot find `tsc`
- No local browser route verification was possible.
- Original screenshot attachment was not available locally per task evidence.

## Next Recommendation

1. Restore/install workspace dependencies in a gated validation environment.
2. Run `pnpm --filter web typecheck`.
3. Start the web app and smoke `/breeding` with seeded daily logs where `log_date` includes both date-only and date-time shapes.
4. Confirm 今日产蛋 equals today's submitted `eggs_produced` sum and 今日死淘 equals today's `mortality_qty + elimination_qty` sum.

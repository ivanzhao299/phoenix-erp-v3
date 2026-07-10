# BUG-20260707-0005 A4 Frontend UAT Smoke

## Result

- Status: PASS WITH CONDITIONS
- Release gate: HOLD until CI/CD, browser smoke, production smoke, and business acceptance are complete.
- Source bug: BUG-20260707-0005
- Source task: BUGTASK-20260707-0005
- Route: `/breeding/daily`
- Issue: 日生产日报不选择鸡舍也能提交成功

## Root Cause

- The affected state is the chicken-house selector carrying the empty value used by the loading/placeholder option (`加载中…` / `请选择鸡舍`).
- The page must block submit before any daily-log POST when that value is empty.
- This branch already had the visible toast guard; this pass made the guard reusable and added focused regression coverage for the exact empty/loading selector value.

## Changed Files

- `apps/web/src/app/(admin)/breeding/daily/page.tsx`
- `apps/web/src/lib/breeding-daily.ts`
- `apps/web/src/lib/breeding-daily.test.ts`
- `docs/ops/BUG-20260707-0005-a4-frontend-uat-smoke.md`

## Frontend Fix

- Added `isDailyReportHouseMissing()` and used it at the top of `handleSubmit`.
- Empty, blank, `null`, and `undefined` chicken-house values are treated as missing.
- The toast remains exactly: `请先选择鸡舍后再提交`.
- The guard returns before `/api/v3/farm/daily-logs` is called.
- Submit buttons remain clickable so users get a visible prompt instead of a silent disabled action.

## Permission / State Preservation

- RBAC visibility is unchanged: existing `usePermission('MENU_FARM_DAILY')` gates still control submit/export/device actions.
- DataScope behavior is unchanged; the fix does not alter selector data loading or backend query scope.
- No attachment ACL, audit, backend, migration, schema, entity, table, or column changes were made.
- Empty/loading/error behavior is preserved: `HouseSelector` still renders an empty-value loading option and the submit guard handles that state.

## Desktop / Mobile Check

- Static responsive check: PASS WITH CONDITIONS.
- The changed UI path is validation-only; no layout dimensions, breakpoints, cards, tables, or mobile-specific files changed.
- Browser desktop/mobile smoke: HOLD because this worktree cannot start the web app without installing missing dependencies.

## Verification

Commands run:

```bash
git diff --check
rg -n "isDailyReportHouseMissing|请先选择鸡舍后再提交|/api/v3/farm/daily-logs|HouseSelector" \
  'apps/web/src/app/(admin)/breeding/daily/page.tsx' \
  apps/web/src/lib/breeding-daily.ts \
  apps/web/src/lib/breeding-daily.test.ts \
  apps/web/src/components/shared-selectors/MasterDataSelectors.tsx
pnpm --filter web test -- src/lib/breeding-daily.test.ts
cd apps/web && ./node_modules/.bin/tsc --noEmit
pnpm install --offline --filter web
```

Results:

- `git diff --check`: PASS.
- Static route/component verification: PASS. The missing-house guard is before the `/api/v3/farm/daily-logs` fetch.
- Focused regression test execution: HOLD. `vitest` is not linked in this worktree.
- Web typecheck: HOLD. `apps/web/node_modules/.bin/tsc` does not exist.
- Offline dependency restore: HOLD. `pnpm install --offline --filter web` failed because `@radix-ui/primitive-1.1.3.tgz` is missing from the local pnpm store.

## Required Follow-up Gate

- Restore web dependencies or run CI in an environment with package access.
- Run `cd apps/web && ./node_modules/.bin/tsc --noEmit`.
- Run `pnpm --filter web test -- src/lib/breeding-daily.test.ts`.
- Browser-smoke `/breeding/daily?action=create&date=today` at desktop and mobile widths:
  - leave chicken house as `加载中…` / `请选择鸡舍`;
  - enter daily data;
  - click `提交日报`;
  - confirm toast `请先选择鸡舍后再提交`;
  - confirm no POST is sent to `/api/v3/farm/daily-logs`.

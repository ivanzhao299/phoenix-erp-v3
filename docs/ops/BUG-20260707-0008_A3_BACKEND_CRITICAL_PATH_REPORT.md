# BUG-20260707-0008 A3 Backend Critical Path Report

Date: 2026-07-08
Agent: A3-Backend-Critical-Path
Branch: `w5-a3-backend-critical-path`
Route: `/breeding`
Result: PASS WITH CONDITIONS

## Summary

Backend compatibility repair completed for the breeding overview KPI source path.

Dry-run diagnosis found `/breeding` reads `GET /api/crud/brd_daily_logs` and computes "今日产蛋 / 今日死淘" by comparing each row `log_date` to `YYYY-MM-DD`. PostgreSQL `DATE` values can be serialized by the Node driver as `Date` / ISO timestamp values, so `2026-07-07T00:00:00.000Z` does not match frontend `2026-07-07` by strict equality. Weekly totals can still show non-zero because their comparison is range-like string comparison.

## Changed Files

- `apps/api/src/modules/generic-crud/generic-crud.service.ts`
  - Renamed the daily-log enrichment path to `enrichDailyLogRows`.
  - Normalizes existing `brd_daily_logs.log_date` and `brd_daily_logs.business_date` fields to `YYYY-MM-DD` before returning Generic CRUD rows.
  - Preserves existing culling/mortality reason dictionary label enrichment.
- `apps/api/src/modules/generic-crud/generic-crud.service.spec.ts`
  - Added coverage for `Date` and ISO timestamp normalization.
  - Added regression coverage that reason-label enrichment still works after date normalization.

## APIs Implemented

No new API was introduced.

Existing API behavior updated:

- `GET /api/crud/brd_daily_logs`
  - `log_date` and `business_date`, when present, now return as date-only strings (`YYYY-MM-DD`) for daily-log rows.
  - This is response normalization only. No request contract, RBAC, DataScope, table, column, or entity change was made.

## RBAC / DataScope / Audit Coverage

- RBAC path preserved:
  - `GenericCrudController` still uses `@UseGuards(AuthGuard('jwt'))`.
  - `brd_*` Generic CRUD fallback menu remains `MENU_FARM_DATA`.
- DataScope path preserved:
  - `brd_daily_logs` row scope remains `site_code` injection for non-global users.
  - No changes were made to `DataScopeService`, `DataScopeGuard`, or farm scope derivation.
- Audit / attachment ACL:
  - No audit writer path changed.
  - No attachment endpoint or ACL path touched.

## Validation Commands

Passed:

- `pwd`
- `git branch --show-current`
- `git status --short` before repair: clean
- `git log --oneline --decorate -8`
- `pnpm --dir apps/api test -- generic-crud.service.spec.ts --runInBand`
- `pnpm --dir apps/api test -- generic-crud.service.spec.ts farm.service.spec.ts generic-crud.controller.spec.ts --runInBand`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `git diff --check`
- RBAC/DataScope static check with `rg` over farm and generic-crud guard/scope markers

Blocked / conditional:

- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - Failed before any frontend change with missing `vitest` / `vitest/config` type declarations in existing web test files and `vitest.config.ts`.
  - This task made no frontend code changes.

## Frozen-Item Statement

No migrations, schema changes, entity changes, table/column changes, database writes, production deploy, push, merge, task-board updates, or frontend code changes were performed.

## Blockers

- Local commit is blocked by the current filesystem sandbox. `git add apps/api/src/modules/generic-crud/generic-crud.service.ts apps/api/src/modules/generic-crud/generic-crud.service.spec.ts docs/ops/BUG-20260707-0008_A3_BACKEND_CRITICAL_PATH_REPORT.md` failed because Git needs to create `/Users/mac/phoenix-erp/.git/worktrees/a3-backend-critical-path/index.lock`, and that `.git` path is read-only in this session.
- Full Web typecheck remains blocked by the existing missing `vitest` type dependency condition.
- Production verification was not run by this agent because deploy, production DB access, and production writes are forbidden by the task guardrails.

## Next Review Request

- A4 Frontend/UAT should smoke `/breeding` against an environment with today daily reports and confirm "今日产蛋 / 今日死淘" now match submitted daily report totals.
- A1 CI Runtime Gate should rerun the full CI set after the web `vitest` type dependency condition is resolved or accepted as an existing blocker.
- If KPIs still show zero after this backend normalization, A5 Data Readiness should verify that today's `brd_daily_logs` rows have the expected `log_date`, `eggs_produced`, `mortality_qty`, and scoped `site_code` values.

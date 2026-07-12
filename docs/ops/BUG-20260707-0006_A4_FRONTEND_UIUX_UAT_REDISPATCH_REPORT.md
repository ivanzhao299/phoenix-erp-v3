# BUG-20260707-0006 A4 Frontend UIUX UAT Redispatch Report

Date: 2026-07-13

Agent: A4-Frontend-UIUX-UAT

Route: `/breeding/daily`

Source bug: BUG-20260707-0006

Source task: BUGTASK-20260707-0006

Status: PASS WITH CONDITIONS

## Issue

近期日报记录下的淘汰原因不显示中文。Bug snapshot showed raw culling reason codes in the recent daily report table, including `INJURY`, `SICKNESS`, `LOW_PRODUCTION`, and `AGE`.

## Diagnosis

The daily report form already uses `DictSelect` with `BRD_CULLING_REASON`, so newly selected culling reasons show Chinese labels in the selector. The recent report table rendered `r.cullingReason` directly, so historical rows or backend responses containing raw codes were displayed as raw English codes.

This is frontend-owned because the affected route can translate display values without changing schema, API contracts, DataScope, RBAC, audit, or attachment behavior.

## Changed Files

- `apps/web/src/lib/breeding-daily.ts`
  - Added `cullingReasonLabel()` with runtime dictionary override and fallback labels for known historical codes.
- `apps/web/src/lib/breeding-daily.test.ts`
  - Added regression coverage for `INJURY`, `SICKNESS`, `LOW_PRODUCTION`, `AGE`, dictionary override, unknown values, and empty values.
- `apps/web/src/app/(admin)/breeding/daily/page.tsx`
  - Loaded `BRD_CULLING_REASON` code map via `useDictOptions`.
  - Recent report table now renders `cullingReasonLabel(r.cullingReason, cullingReasonCodeMap)`.
  - CSV export now labels `r.elimReason` instead of exporting raw selected codes.

## Permission, State, And Scope Check

- RBAC visibility is preserved: existing `canEdit` and `canExport` gates are unchanged.
- DataScope is preserved: data loading still uses existing `useCrud('brd_daily_logs')`; no new API endpoint or query was added.
- Error/loading/empty states are preserved: no fetch path was changed, and the existing empty row `暂无该鸡舍的日报记录` is unchanged.
- Attachment ACL is not touched.
- No backend, migration, schema, entity, table, column, database write, deploy, push, or task-board operation was performed.

## Validation

Commands run:

```bash
pnpm --filter web test -- src/lib/breeding-daily.test.ts
cd apps/web && ./node_modules/.bin/tsc --noEmit
git diff --check -- 'apps/web/src/app/(admin)/breeding/daily/page.tsx' apps/web/src/lib/breeding-daily.ts apps/web/src/lib/breeding-daily.test.ts
cd apps/web && ./node_modules/.bin/eslint src/lib/breeding-daily.ts src/lib/breeding-daily.test.ts
rg -n "cullingReasonLabel|BRD_CULLING_REASON|r\\.cullingReason|r\\.elimReason|近期日报记录|暂无该鸡舍的日报记录|canEdit|canExport" 'apps/web/src/app/(admin)/breeding/daily/page.tsx' apps/web/src/lib/breeding-daily.ts apps/web/src/lib/breeding-daily.test.ts
```

Results:

- Focused Vitest: PASS, 4 tests passed.
- Web typecheck: PASS, 0 errors.
- Diff whitespace check: PASS.
- Focused lint for changed utility/test files: PASS.
- Route source verification: PASS; recent table and export both route culling reason values through `cullingReasonLabel`.

Additional lint note:

```bash
cd apps/web && ./node_modules/.bin/eslint src/lib/breeding-daily.ts src/lib/breeding-daily.test.ts 'src/app/(admin)/breeding/daily/page.tsx'
```

This command still fails on pre-existing page-level lint findings in `daily/page.tsx` such as unused imports, `no-explicit-any`, and existing `react-hooks/set-state-in-effect` findings. The new utility/test files pass lint, and Web typecheck passes.

## Desktop And Mobile Behavior

The patch changes only rendered text content in the existing table cell and CSV export value; it does not change layout, CSS, breakpoints, table structure, buttons, permissions, loading, error, or empty-state rendering.

Attempted local browser UAT:

```bash
cd apps/web && ./node_modules/.bin/next dev -p 3001
cd apps/web && ./node_modules/.bin/next dev -H 127.0.0.1 -p 3001
```

Both attempts failed in the sandbox with `listen EPERM`, including localhost binding. Because the local Web server could not be started, desktop and mobile real-browser screenshots were not captured in this run.

Condition: run authenticated desktop and mobile browser UAT on staging or another environment that permits serving the app, and confirm recent rows render:

- `INJURY` -> `严重外伤`
- `SICKNESS` -> `患病`
- `LOW_PRODUCTION` -> `产蛋率低`
- `AGE` -> `老龄`

## Result

PASS WITH CONDITIONS.

Frontend-owned code now maps known culling reason codes to Chinese labels in the recent daily report table and export path, with focused regression coverage and Web typecheck passing. This is not a claim that the production bug is fully resolved until CI/CD, staging or production smoke, desktop/mobile browser UAT, and business acceptance are complete.

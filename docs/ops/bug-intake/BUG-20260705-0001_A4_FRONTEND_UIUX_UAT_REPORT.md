# BUG-20260705-0001 A4 Frontend UI/UX UAT Report

## Result

PASS WITH CONDITIONS.

This is a frontend-owned UI repair for `/pilot-run`. It is not a final business resolution claim. CI/CD, production smoke, and business acceptance are still required before the source bug can be closed.

## Source

- Bug: `BUG-20260705-0001`
- Repair task: `BUGTASK-20260705-0001`
- Route: `/pilot-run`
- Reporter issue: `验收试运行里面试运行项目页面奇丑无比`
- Assigned scope: `apps/web/**` and task-specific `docs/ops/**`

## Diagnosis

The route was frontend-owned at `apps/web/src/app/(admin)/pilot-run/page.tsx`.

The page rendered as a dense one-off dashboard: local KPI card implementation, crowded fixed grid, emoji-bearing readiness text, oversized rounded panels, and weak mobile/table overflow handling. The route did not reuse the Phoenix admin header, KPI card, loading, empty, or error state components already present in the design system.

No backend, schema, migration, database write, deployment, push, or task-board operation was performed.

## Changed Files

- `apps/web/src/app/(admin)/pilot-run/page.tsx`
- `apps/web/src/app/(admin)/pilot-run/pilot-run.module.css`
- `apps/web/src/lib/pilot-run-ui.ts`
- `apps/web/src/lib/pilot-run-ui.test.ts`
- `docs/ops/bug-intake/BUG-20260705-0001_A4_FRONTEND_UIUX_UAT_REPORT.md`

## Repair Summary

- Replaced the local KPI card implementation with `KpiCardV2`.
- Replaced ad hoc header rendering with `PageHeader`.
- Replaced loading/error/empty placeholders with `LoadingSkeleton`, `ErrorState`, and `EmptyState`.
- Added a route-local CSS module for stable desktop and mobile layouts:
  - `auto-fit` KPI grid.
  - two-column desktop score layout collapsing to one column below `900px`.
  - single-column KPI/actions below `640px`.
  - horizontal scrolling for trend and report table instead of squeezed content.
- Removed emoji from the go-live readiness KPI value and converted it to compact text.
- Preserved the existing feedback widget, API endpoints, auth header behavior, report generation flow, dashboard error handling, and silent report-history fallback.
- Added focused helper tests for amount formatting, status mapping, and readiness labels.

## Validation

Commands run from `apps/web`:

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run src/lib/pilot-run-ui.test.ts
./node_modules/.bin/eslint 'src/app/(admin)/pilot-run/page.tsx' 'src/lib/pilot-run-ui.ts' 'src/lib/pilot-run-ui.test.ts'
```

Results:

- Web typecheck: PASS.
- Focused Vitest: PASS, `3` tests passed.
- Focused ESLint: PASS.

Additional compile/smoke attempts:

```bash
./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3000
./node_modules/.bin/next dev --hostname 127.0.0.1 --port 4300
./node_modules/.bin/next build
./node_modules/.bin/next build --webpack
```

Results:

- Local browser smoke server: HOLD condition. Both dev-server attempts failed with `listen EPERM`, so live desktop/mobile screenshots could not be captured in this sandbox.
- `next build`: HOLD condition. Turbopack failed before route compilation because `apps/web/node_modules` is a symlink outside the filesystem root.
- `next build --webpack`: HOLD condition. Webpack fallback failed on sandbox environment issues: blocked `fonts.googleapis.com` DNS and broken symlinked module paths pointing at another worktree.

## Desktop And Mobile Check

Source-level responsive behavior was checked for the affected route:

- Desktop: content is capped at `1280px`, KPIs use `repeat(auto-fit, minmax(210px, 1fr))`, score/detail panels use a two-column grid.
- Tablet: score/detail panels collapse at `900px`.
- Mobile: KPI grid, header-like rows, readiness row, and report actions collapse to single-column at `640px`; buttons become full width; trend and report table scroll horizontally instead of compressing text.

Condition: a real browser viewport check at desktop and mobile remains required in CI/staging/production because this sandbox cannot bind a local Next server.

## RBAC, DataScope, States

- RBAC/DataScope: preserved. The route still calls the same `/api/uat/pilot-runs/:id/*` endpoints with the same bearer token header. No permission bypass or additional frontend-only data source was introduced.
- Loading state: preserved and upgraded to skeletons.
- Error state: preserved and upgraded to `ErrorState` with retry.
- Empty states: preserved for trend and report history via `EmptyState`.
- Attachment ACL: not touched. No attachment behavior was changed.

## Final Decision

PASS WITH CONDITIONS.

Conditions before closing the bug:

1. Run CI in a normal dependency/network environment.
2. Perform real desktop and mobile browser smoke on `/pilot-run`.
3. Perform production or staging smoke after approved deployment.
4. Obtain business acceptance from the reporter or designated UAT owner.

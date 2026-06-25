# Production Readiness Remediation Batch - Controller Gates

Date: 2026-06-25

## Objective

Close the next P0/P1 production-readiness item from the audit backlog: sensitive API controllers must not rely on login-only access when they expose user, procurement, dashboard, audit, pricing, wholesale, packaging terminal, or data quality operations.

## Changes

1. Enabled class-level `@RequireMenu` support in `MenuGuard`.
2. Added menu guards to BFF aggregate controllers:
   - dashboard: `MENU_DASHBOARD:V`
   - users: `MENU_SETTINGS_IT:V/C/E`
   - analytics: `MENU_DASHBOARD:V` with `MENU_ANALYTICS` fallback
   - audit: `MENU_SYS_MONITOR:V/E`
   - pricing: `MENU_SALES2:V/E` with report fallback
   - wholesale: `MENU_SALES2:V/E`
   - packaging terminal: `MENU_PKG_OP:V/E`
3. Added menu guards to legacy analytics, data quality, procurement, and project lookup controllers.
4. Added DataScope filtering to business project lookup by company scope.
5. Updated sensitive controller scanner to distinguish documented non-menu models:
   - dynamic generic CRUD PBAC
   - master-data runtime guard
   - notification SSE query-token verification

## Validation

| Check | Result |
| --- | --- |
| `node scripts/ci/check-sensitive-menu-guards.mjs` | PASS, 0 findings |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |

## Safety

- Business code changed: yes, API security guards only.
- Frontend changed: no.
- Migration executed: no.
- Database write executed: no.
- Deploy executed by this commit: no; CI/CD deploy is expected after push.
- Push status: pending at report creation.

## Remaining Backlog

1. Continue RBAC/DataScope review for procurement and inventory list endpoints.
2. Sweep frontend high-risk buttons so hidden/disabled states match backend menu bits.
3. Continue legacy `/uploads` convergence toward protected file endpoints.
4. Complete production data readiness gaps for supplier, product, warehouse, cash account, bank account, and project master data.
5. Harden CI/CD operations: separate deploy keys, remove default admin credentials from scripts, and strengthen rollback evidence.

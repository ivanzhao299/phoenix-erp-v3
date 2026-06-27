# Debug Endpoint Production Disable Remediation

Date: 2026-06-27
Owner: Codex-Orchestrator
Scope: production debug surface reduction

## Problem

`GET /api/v3/debug/migrated-data` was globally registered and protected only by `MENU_SYS_MONITOR:V`. It returned raw sample rows from:

1. `sys_user`
2. `biz_cash_flow`
3. `sys_approval_log`

That behavior is not appropriate for production-grade RBAC/data minimization. Even with a monitoring permission, debug endpoints should not expose raw user, finance, or approval records.

## Remediation

- `apps/api/src/debug.controller.ts`
  - The endpoint now fails closed in production before any query.
  - Non-production output is limited to aggregate counts.
  - Raw sample rows were removed.

- `scripts/ci/check-menu-permission-atomicity.mjs`
  - Added a guard that fails if this debug controller returns `SELECT *` sample rows again.
  - Added a guard that fails if the endpoint no longer checks `NODE_ENV === 'production'` and throws `ForbiddenException`.

## Result

| Check | Result |
| --- | --- |
| Production debug raw rows | Removed |
| Production endpoint availability | Disabled |
| Non-production diagnostic value | Aggregate counts retained |
| Business code behavior | Not changed |
| Migration / DB write | Not executed |
| Deploy / push | Pending CI/CD after commit |

## Validation

Planned validation:

1. API typecheck.
2. Web typecheck.
3. Menu permission atomicity guard.
4. W5 closeout gate.
5. `git diff --check`.

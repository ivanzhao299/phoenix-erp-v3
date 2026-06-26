# RBAC / Frontend Gate Remediation Batch - 2026-06-26

## Scope

This batch continues the production readiness cleanup focused on role-permission drift and frontend menu visibility issues.

## Fixed Items

### 1. System users API no longer stacks hard role allowlists on top of MenuGuard

File: `apps/api/src/modules/master/system-users.controller.ts`

Before this batch, `/api/system/users` was protected by `MenuGuard`, but individual handlers still called hard-coded role allowlists such as `ROLE_ADMIN`, `ROLE_HR_ADMIN`, and `ROLE_SYSOPS`. This could reject a user who had the correct menu permission but not one of those legacy roles.

Changes:

- Class gate aligned to `MENU_SETTINGS_USER:V`.
- List endpoint requires `MENU_SETTINGS_USER:V`.
- Create endpoint requires `MENU_SETTINGS_USER:C`.
- Update/status/role/password/role-visibility endpoints require `MENU_SETTINGS_USER:E`.
- Removed local role allowlist checks from this controller.

Result: user management now follows the role-menu permission matrix instead of parallel role-name logic.

### 2. Admin dashboard quick navigation now hides unauthorized module entries

File: `apps/web/src/app/(admin)/dashboard/page.tsx`

Before this batch, the dashboard quick navigation rendered static module cards, which could expose entries the user could not actually access.

Changes:

- Page-level access now uses `MENU_DASHBOARD:V`, with finance fallback to `/finance2` when the user has finance access but not dashboard access.
- Quick links now carry a menu permission and optional alternatives.
- Unauthorized quick links are filtered before render.

Result: users no longer see quick-link cards for modules outside their granted menu permissions.

### 3. Packaging label printer driver access now uses atomic permission

File: `apps/web/src/app/(terminal)/terminal/packaging/label-print/page.tsx`

Before this batch, the driver-download section used `ROLE_ADMIN` / `ROLE_PKG_MANAGER`. That could diverge from the packaging permission matrix.

Changes:

- Replaced role check with `MENU_PKG_MGR:E`.
- Updated visible badge text from “仅管理员” to “需包装管理权限”.

Result: packaging driver tools are visible only to users with packaging management edit authority.

## Safety Boundary

- Business logic scope: RBAC/frontend gate alignment only.
- DB write: no.
- Migration: no.
- Deploy script change: no.
- Production operation during coding: no.

## Validation

To be executed before commit:

- API typecheck.
- Web typecheck.
- W5 closeout gate.

## Remaining Follow-up

1. Continue workflow approval-role defaults cleanup so workflow builders do not silently default to admin/sysops roles.
2. Continue old workflow/procurement approver lookup audit.
3. Continue shareholder finance service DataScope and permission audit.
4. Continue frontend page-level no-permission UX cleanup.

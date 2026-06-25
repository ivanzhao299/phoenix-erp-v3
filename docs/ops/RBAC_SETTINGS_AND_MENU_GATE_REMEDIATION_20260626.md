# RBAC Settings And Menu Gate Remediation - 2026-06-26

## Objective

Continue production-readiness remediation by removing coarse-grained settings permissions from visible menus and sensitive settings APIs.

This pass focuses on:

- User management API alignment.
- Notification configuration API hardening.
- Brand configuration API hardening.
- Settings sidebar atomic visibility.
- Online users indicator pre-check.
- CI regression guard expansion.

## Completed Changes

### 1. User Management API

Updated `apps/api/src/modules/bff/bff.controller.ts`.

Before:

- `/api/users` endpoints were primarily gated by `MENU_SETTINGS_IT`.

After:

- Primary menu: `MENU_SETTINGS_USER`
- Transitional fallback: `MENU_SETTINGS_IT`

Result:

- A user who has "用户管理" permission can use the corresponding backend endpoint.
- A user without user-management permission no longer receives a confusing frontend-visible/backend-denied split.

### 2. Notification Configuration API

Updated `apps/api/src/modules/notification/notification-config.controller.ts`.

Before:

- Config CRUD used broad `MENU_SYS_CONFIG`.

After:

- Primary menu: `MENU_SETTINGS_NOTIFY`
- Transitional fallback: `MENU_SYS_CONFIG`, `MENU_SETTINGS_IT`

Result:

- Notification rules, templates, channels, logs, and test fire actions now have a dedicated settings leaf permission.
- User preference endpoints remain self-service and authenticated, not admin config endpoints.

### 3. Brand Configuration API

Updated `apps/api/src/modules/master/master.controller.ts`.

Before:

- Brand update used `MENU_SETTINGS_IT`.

After:

- Primary menu: `MENU_SETTINGS_BRAND`
- Transitional fallback: `MENU_SETTINGS_IT`

Result:

- Brand configuration no longer depends on the broad IT settings menu.

### 4. Settings Sidebar Atomization

Updated `apps/web/src/components/layout/Sidebar.tsx`.

Settings leaves now use atom permissions:

- `MENU_SYS_CONFIG`
- `MENU_SETTINGS_SECURITY`
- `MENU_SETTINGS_AUDIT`
- `MENU_SETTINGS_BRAND`
- `MENU_SETTINGS_TERMINAL`
- `MENU_SETTINGS_POS`
- `MENU_SETTINGS_STOCK`
- `MENU_SETTINGS_NOTIFY`
- `MENU_SYS_MONITOR`

Result:

- Users should not see unauthorized settings children.
- Parent settings directory is shown only if at least one child is visible.

### 5. Online Users Indicator

Updated `apps/web/src/components/layout/OnlineUsersIndicator.tsx`.

Result:

- The header online-user indicator checks `MENU_SYS_MONITOR` before polling `/api/system/online-count`.
- This reduces noisy 403 polling for users without monitor permission.

### 6. Migration

Added `apps/api/src/database/migrations/1782047418112-SeedSettingsOperationalAtomicMenus.ts`.

The migration:

- Registers seven operational settings atom menu codes.
- Backfills existing role-menu permissions from `MENU_SETTINGS_IT`.
- Includes `down()` for rollback.

### 7. CI Guard

Updated `scripts/ci/check-menu-permission-atomicity.mjs`.

New regression blocks:

- `/api/users` falling back to primary `MENU_SETTINGS_IT`.
- Notification config falling back to primary `MENU_SYS_CONFIG`.
- Brand update falling back to primary `MENU_SETTINGS_IT`.

## Risk

Risk level: Medium.

Reason:

- System menu and role-menu permissions are changed.
- Transition fallback remains to avoid deployment-window lockout.
- No business data tables are changed.

## Validation Checklist

Required:

- API typecheck.
- Web typecheck.
- Menu atomicity check.
- Sensitive menu guard check.
- Unsafe attachment reference check.
- Migration down() check.
- Migration no-data-DML check.
- W5 closeout gate.
- CI/CD deploy.

## Remaining Known Work

1. Continue API/controller review for remaining coarse settings or monitor endpoints.
2. Audit high-frequency procurement and inventory list DataScope.
3. Review role matrix for Wang Lejin and other pilot users.
4. Continue frontend page-level style polish after RBAC atomization stabilizes.
5. Continue legacy `/uploads` compatibility closure and protected attachment endpoint convergence.
6. Review deployment workflow secret handling and SSH deploy key separation.

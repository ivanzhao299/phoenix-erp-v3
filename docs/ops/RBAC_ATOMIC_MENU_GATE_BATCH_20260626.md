# RBAC Atomic Menu Gate Batch - 2026-06-26

## Goal

Continue production-readiness remediation by removing coarse permission fallbacks from high-risk system, role, permission-set, notification, brand, and Chanjet diagnostic endpoints.

## Changes

### Backend permission tightening

- `apps/api/src/modules/permissions/permissions.controller.ts`
  - Removed `MENU_SETTINGS_IT` fallback from role permission matrix, conflicts, effective permissions, role grants, and role lifecycle endpoints.
  - Effective access now requires `MENU_SETTINGS_ROLE` with the required action bit.

- `apps/api/src/modules/permissions/permission-sets.controller.ts`
  - Removed `MENU_SETTINGS_IT` fallback from permission-set list/detail/create/update/delete/item/bind endpoints.
  - Effective access now requires `MENU_SETTINGS_PERMISSION_SET`.

- `apps/api/src/modules/permission-sets/permission-sets.controller.ts`
  - Removed duplicate legacy controller fallback to `MENU_SETTINGS_IT`.
  - Effective access now requires `MENU_SETTINGS_PERMISSION_SET`.

- `apps/api/src/modules/notification/notification-config.controller.ts`
  - Removed `MENU_SYS_CONFIG` and `MENU_SETTINGS_IT` fallbacks from notification rule, template, channel, and test-fire endpoints.
  - Effective access now requires `MENU_SETTINGS_NOTIFY`.

- `apps/api/src/modules/bff/bff.controller.ts`
  - Removed `MENU_SETTINGS_IT` fallback from user administration endpoints.
  - Effective access now requires `MENU_SETTINGS_USER`.

- `apps/api/src/modules/master/master.controller.ts`
  - Removed `MENU_SETTINGS_IT` fallback from brand update.
  - Effective access now requires `MENU_SETTINGS_BRAND:E`.

- `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`
  - Tightened manual external calls:
    - `GET /api/chanjet/test-token`: `MENU_SYS_CONFIG:E`
    - `GET /api/chanjet/test-api`: `MENU_SYS_CONFIG:E`
  - Added structured server logs for manual Chanjet test triggers without logging tokens, secrets, or response payloads.

### Frontend menu visibility

- `apps/web/src/components/layout/Sidebar.tsx`
  - Removed broad `MENU_SETTINGS_IT` fallback from system settings children.
  - Removed `MENU_SYS_CONFIG` fallback from notification settings.
  - Removed `MENU_SETTINGS_IT` fallback from system error logs.
  - Authorized users still see menus through their atomic menu grants.

## Risk Controls

- No database migration added.
- No database write performed.
- No production data touched.
- Existing atomic menu migrations already backfill compatible permissions from `MENU_SETTINGS_IT`.
- The change primarily blocks users who only have broad legacy settings permission but do not have the matching atomic child permission.

## Validation

- API typecheck required.
- Web typecheck required.
- W5 closeout gate required.
- Production CI/CD required after push.

## Remaining Work

1. Continue auditing broad `altPerms` in non-settings business modules.
2. Continue procurement and inventory list DataScope verification.
3. Continue legacy `/uploads` closure and protected endpoint convergence.
4. Continue role matrix review for pilot users, including Wang Lejin and Liu Hantao.
5. Continue UI consistency cleanup after RBAC/menu gates stabilize.

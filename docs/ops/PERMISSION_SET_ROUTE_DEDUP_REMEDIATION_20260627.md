# Permission Set Route Dedup Remediation

Date: 2026-06-27

## Scope

This remediation removes a duplicate backend route owner for permission-set management.

## Finding

`/api/permission-sets` was registered by two modules:

- `apps/api/src/modules/permissions/permission-sets.controller.ts`
- `apps/api/src/modules/permission-sets/permission-sets.controller.ts`

The frontend permission-set page uses the standalone `PermissionSetsModule` contract:

- `GET /api/permission-sets`
- `GET /api/permission-sets/:code`
- `PATCH /api/permission-sets/:code`
- `POST /api/permission-sets`
- `PUT /api/permission-sets/:code/items`
- `POST /api/permission-sets/:code/roles/:roleCode`
- `DELETE /api/permission-sets/:code/roles/:roleCode`
- `POST /api/permission-sets/:code/users/:userId`
- `DELETE /api/permission-sets/:code/users/:userId`

The legacy controller under `modules/permissions` exposed overlapping routes with a different response and binding shape. Keeping both active can create unstable route ownership and unexpected permission-set behavior.

## Change

`PermissionsModule` now registers only role-permission APIs:

- `PermissionsController`
- `PermissionsService`

The standalone `PermissionSetsModule` remains the only active owner of `/api/permission-sets`.

## Guardrail

`scripts/ci/check-menu-permission-atomicity.mjs` now fails if `PermissionsModule` registers `PermissionSetsController` again.

## Verification

Required checks:

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`

## Production Risk

Risk level: Low.

This is a route registration cleanup. It does not modify database schema, business tables, frontend flows, deployment configuration, or permission data.

## Result

Permission-set route ownership is now explicit and singular. This reduces RBAC configuration instability and supports the broader atomic permission cleanup work.

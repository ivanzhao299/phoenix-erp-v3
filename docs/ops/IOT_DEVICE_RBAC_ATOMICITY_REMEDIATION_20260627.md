# IoT Device RBAC Atomicity Remediation - 2026-06-27

## Objective

Tighten high-risk IoT/device endpoints so they no longer rely on login-only guards or unguarded access. Align device monitoring, alert handling, mapping, sync, and report generation with atomic menu permission `MENU_DEVICE_MONITOR`.

## Scope

Updated backend device controllers:

- `apps/api/src/modules/iot/farm-cabin.controller.ts`
- `apps/api/src/modules/iot/farm-device.controller.ts`
- `apps/api/src/modules/iot/iot-v3.controller.ts`
- `apps/api/src/modules/iot/mon-device.controller.ts`

Updated CI regression gate:

- `scripts/ci/check-menu-permission-atomicity.mjs`

## Changes

1. Replaced login-only `AuthGuard('jwt')` route coverage with `MenuGuard`.
2. Added class-level `@RequireMenu('MENU_DEVICE_MONITOR', 'V')` for device read endpoints.
3. Added method-level `@RequireMenu('MENU_DEVICE_MONITOR', 'E')` for device sync, mappings, alert updates, property dictionary updates, and IoT report generation.
4. Protected previously unguarded device operations under the same atomic permission.
5. Parameterized `GET /api/farm-device/alerts` filters to remove raw SQL string interpolation for `status` and `house_code`.
6. Added CI checks to prevent IoT controllers from regressing to AuthGuard-only access or missing `MENU_DEVICE_MONITOR`.

## Risk Controls

- No schema changes.
- No migration added.
- No database write executed.
- No frontend behavior changed.
- No deployment script changed.
- Existing `MENU_DEVICE_MONITOR` sidebar permission and menu registry fallback are reused.

## Validation

| Command | Result |
| --- | --- |
| `node scripts/ci/check-menu-permission-atomicity.mjs` | PASS |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS |

## Remaining Follow-up

1. Continue scanning non-module parent permissions and remaining controller-level menu fallbacks.
2. Review duplicate permission-set controller routes before any consolidation.
3. Apply role-permission matrix repair only after narrowing broad inherited grants to least-privilege role owners.

## Conclusion

GO WITH CONDITIONS. IoT/device endpoints are now aligned to atomic device monitoring permissions, and CI guards cover regression. Continue the global RBAC cleanup with the next high-risk permission domain.

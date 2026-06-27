# Quality and Mobile Menu Registry Remediation - 2026-06-27

## Scope

This batch closes a menu registry and role matrix gap for atomic permissions already used by runtime code.

## Fixed Gaps

- `MENU_QA_MASTER`
  - Used by `/quality/standards` and the quality API standards endpoint.
  - Registered as `质量标准`.
  - Inherits only `V` from legacy quality manager/source quality permissions.
- `MENU_MOBILE_DELIVERY`
  - Used by the mobile delivery API and mobile dashboard visibility.
  - Registered as `移动配送`.
  - Inherits only `V/C/E` from delivery/logistics source permissions.
  - `ROLE_DRIVER` receives `V/C/E` explicitly to preserve delivery operation ability.

## Safety Boundary

- Migration contains menu/role permission DML only.
- No schema/entity/table/column change.
- No business data write.
- No destructive change.
- `down()` removes only the two newly registered menu codes and their grants.

## Verification Plan

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
- `node scripts/check-nullable-in-unique.js`
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`
- `git diff --check`


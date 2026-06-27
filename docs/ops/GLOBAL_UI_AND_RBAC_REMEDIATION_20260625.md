# Global UI And RBAC Remediation - 2026-06-25

## Scope

This pass continues the production-readiness cleanup for Phoenix ERP.

Covered:

- Global error and not-found page baseline.
- Shared input/select visual baseline for frequently reused controls.
- Shared confirmation dialog visual cleanup.
- Settings role and permission-set menu atomization.
- CI regression guard for role/permission-set menu atomization.

Not covered in this pass:

- Full role matrix redesign for every module.
- Production data correction beyond the approved menu migration.
- Frontend redesign of every page-specific form.

## UI Cleanup

### Error Pages

Added production-grade fallback pages:

- `apps/web/src/app/error.tsx`
- `apps/web/src/app/not-found.tsx`

Updated:

- `apps/web/src/components/ErrorBoundary.tsx`

Result:

- Runtime page exceptions now show a consistent recovery UI.
- 404 and unauthorized-looking missing routes no longer expose a raw browser/Next error surface.
- The UI gives users a clear retry/home path.

### Form Baseline

Updated global CSS in `apps/web/src/app/globals.css` with:

- `.phx-input`
- `.phx-select`
- `.phx-textarea`
- `.phx-label`
- `.phx-help`
- `.phx-error-text`
- `.phx-error-shell`
- `.phx-error-card`
- `.phx-btn`

Updated shared components:

- `DictSelect`
- `MasterDataSelectors`
- `DataTable` search input
- `ConfirmDialog`

Result:

- Shared selectors and common search inputs now use the same production control baseline.
- Confirm dialog spacing, mobile sizing, overlay, and state colors are aligned with global tokens.

## RBAC Cleanup

### Problem

Role management and permission-set management were both gated by the broad menu code:

- `MENU_SETTINGS_IT`

That made it too easy for a user with broad IT settings visibility to see or call role/permission-set APIs beyond the expected atom-level menu boundary.

### Change

Added atom menu codes:

- `MENU_SETTINGS_ROLE`
- `MENU_SETTINGS_PERMISSION_SET`

Updated API guards:

- `apps/api/src/modules/permissions/permissions.controller.ts`
- `apps/api/src/modules/permissions/permission-sets.controller.ts`
- `apps/api/src/modules/permission-sets/permission-sets.controller.ts`

Updated frontend menu and role detail edit gating:

- `apps/web/src/components/layout/Sidebar.tsx`
- `apps/web/src/app/(admin)/settings/roles/[code]/page.tsx`

### Compatibility

During transition, backend guards use the new atom menu as primary and keep `MENU_SETTINGS_IT` as `altMenus` fallback. This prevents a deployment-window lockout while the migration backfills existing role permissions.

### Migration

Added:

- `apps/api/src/database/migrations/1782046418112-SeedSettingsAtomicPermissionMenus.ts`

The migration:

- Registers the two atom menus.
- Copies compatible V/C/E/D permission bits from `MENU_SETTINGS_IT`.
- Provides `down()` to remove only the new atom menus and their role-menu bindings.

## CI Guard

Updated:

- `scripts/ci/check-menu-permission-atomicity.mjs`

New checks block:

- Permission controller direct use of `MENU_SETTINGS_IT`.
- Permission-set controller direct use of `MENU_SETTINGS_IT`.
- Sidebar roles/permission-set entries gated only by `MENU_SETTINGS_IT`.
- Empty `@RequireMenu(..., '')` action bits.

## Risk

- Risk level: Medium.
- The migration writes only system menu and role-menu permission metadata.
- No business data tables are changed.
- No production deployment logic is changed.

## Validation

Required validation for this pass:

- API typecheck.
- Web typecheck.
- Menu atomicity check.
- Migration guard.
- W5 closeout gate.
- Git diff check.

## Next Remediation Batch

Recommended next batch:

1. Continue atomizing remaining `MENU_SETTINGS_IT` settings children:
   - security policy
   - audit log
   - notification settings
   - terminal/PDA/POS config
2. Enforce API-side guards for notification config, online users, and presence endpoints.
3. Continue inventory/procurement DataScope list checks.
4. Continue legacy upload endpoint closure and frontend attachment endpoint convergence.
5. Run role matrix review for Wang Lejin and high-frequency procurement users.

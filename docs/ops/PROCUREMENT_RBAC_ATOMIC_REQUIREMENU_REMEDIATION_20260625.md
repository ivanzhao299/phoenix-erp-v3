# Procurement RBAC Atomic RequireMenu Remediation

Date: 2026-06-25

## Objective

Continue the menu visibility remediation by aligning procurement backend guards with the atomic menu codes already used by the frontend sidebar.

The goal is to prevent the system from relying only on frontend hiding. Backend APIs must also enforce the same granular permission boundaries.

## Scope

Changed backend controller guards only:

- `apps/api/src/modules/procurement-v2/controllers/suppliers.controller.ts`
- `apps/api/src/modules/procurement-v2/controllers/projects.controller.ts`
- `apps/api/src/modules/procurement-v2/controllers/requests.controller.ts`

No database schema change, migration, seed, or business data write was performed.

## Previous Gap

The left navigation had been updated to prefer atomic procurement menu codes:

- `MENU_PRC2_SUPPLIER`
- `MENU_PRC2_PROJECT`
- `MENU_PRC2_REQUEST`

But the corresponding procurement-v2 backend controllers still used the coarse legacy permission:

- `MENU_PRC2_MASTER`

That meant UI visibility could be finer than backend authorization. A user could be granted one atomic menu but still need a broad legacy permission to call the API, or a legacy broad permission could continue to cover several areas at once.

## Remediation Applied

Backend guards now prefer atomic codes:

### Suppliers

- List/detail: `MENU_PRC2_SUPPLIER:V`
- Create: `MENU_PRC2_SUPPLIER:C`
- Update/status: `MENU_PRC2_SUPPLIER:E`

Legacy fallback:

- `MENU_PRC2_MASTER`

### Projects

- List/detail: `MENU_PRC2_PROJECT:V`
- Create: `MENU_PRC2_PROJECT:C`
- Update/status: `MENU_PRC2_PROJECT:E`

Legacy fallback:

- `MENU_PRC2_MASTER`

### Purchase Requests

- List/detail/approval log: `MENU_PRC2_REQUEST:V`
- Create: `MENU_PRC2_REQUEST:C`
- Update/submit/cancel: `MENU_PRC2_REQUEST:E`
- Approve/reject: `MENU_PRC2_REQUEST:A`

Legacy fallback:

- `MENU_PRC2_MASTER`

## Why Fallback Remains

`MenuGuard` supports `altMenus`, so existing roles using `MENU_PRC2_MASTER` continue to work while role matrices are migrated to the atomic codes.

This avoids a production permission outage. The target state remains: roles should be granted the atomic code they need, not a broad legacy code.

## Production Rule

No permission should be frontend-only.

The intended chain is:

1. Sidebar hides unauthorized menu entries.
2. Page-level buttons hide or disable unauthorized actions.
3. Backend controllers enforce the same menu/action bit.
4. DataScope filters returned business data.

## Remaining Work

1. Reconcile actual role grants for procurement users such as 王乐金.
2. Remove broad `MENU_PRC2_MASTER` from operational roles once atomic grants are complete.
3. Check procurement page-level buttons/forms against the same atomic action bits.
4. Extend the same audit to other coarse groups:
   - Store management
   - Workflow configuration
   - WMS in/out actions
   - Finance cash operations already mostly split, but role grants still need review.

## Risk

Risk level: LOW to MEDIUM.

The primary menu code changed, but legacy fallback preserves compatibility. The change tightens future role design without breaking existing coarse-code roles.


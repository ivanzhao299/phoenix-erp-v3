# RBAC Menu Visibility Atomicity Audit

Date: 2026-06-25

## Objective

Analyze whether Phoenix ERP left navigation, parent menus, and child menus are already filtered at the atomic role-permission level, and produce a remediation plan so users do not see unauthorized menu groups, unauthorized child menus, or unauthorized entry points.

## Conclusion

The frontend already has a parent/child filtering mechanism: parent groups are rendered only when at least one child is visible, and child visibility is checked through `AuthContext.hasPermission`.

However, the implementation was not fully atomic in every business area. Some child menu entries still used coarse legacy menu codes, so a user with a broad code could see multiple child menus that should now be independently controlled. One special production terminal entry was also rendered outside the normal `MenuItem` filter.

Therefore the user concern is valid: the system has filtering, but several areas were not yet refined enough to guarantee "no permission, no child menu shown" at product-grade granularity.

## Evidence

### Existing frontend filter

File: `apps/web/src/components/layout/Sidebar.tsx`

- Parent groups are display containers.
- Child items are filtered before rendering.
- If no child item is visible, the parent group is hidden.
- `AuthContext.hasPermission(menuCode, permCode)` reads JWT `permissions` and supports action bits such as `V`, `C`, `E`, `D`, `A`, `X`.

### Atomic menu codes already exist in DB

Local `phoenix_erp.sys_menu` already contains these fine-grained menu codes:

- Procurement: `MENU_PRC2_DASHBOARD`, `MENU_PRC2_SUPPLIER`, `MENU_PRC2_PROJECT`, `MENU_PRC2_REQUEST`, `MENU_PRC2_ORDER`, `MENU_PRC2_PAYMENT`, `MENU_PRC2_RECEIPT`, `MENU_PRC2_SHIPMENT`, `MENU_PRC2_FUND`, `MENU_PRC2_INIT`
- Finance cash: `MENU_FIN2_CASH_VIEW`, `MENU_FIN2_CASH_MASTER`, `MENU_FIN2_CASH_TXN`, `MENU_FIN2_CASH_TRANSFER`
- Packaging terminal: `MENU_PKG_OP`, `MENU_PKG_MGR`

### Gaps found

1. Procurement child menu visibility still used coarse codes for some leaves:
   - Dashboard used `MENU_PRC2`.
   - Supplier, project, and request all used `MENU_PRC2_MASTER`.

2. Finance cash sidebar entries still used coarse `MENU_FIN2_CASH`:
   - Cash accounts and fund transfers were both visible through the same coarse menu code.
   - Backend already distinguishes `MENU_FIN2_CASH_VIEW`, `MENU_FIN2_CASH_MASTER`, `MENU_FIN2_CASH_TXN`, and `MENU_FIN2_CASH_TRANSFER`.

3. The packaging terminal shortcut inside the production group was rendered as a hard-coded `<a>` link instead of a normal menu item, so it did not reuse the unified child-menu visibility helper.

4. Some backend procurement-v2 controllers still use `MENU_PRC2_MASTER` for supplier/project/request endpoints. This means the frontend can improve visibility immediately, but final production-grade authorization still requires backend `@RequireMenu` refinement.

## Changes Applied

### Sidebar visibility helper

Added a single `canSeeMenuItem` helper in `Sidebar.tsx`.

Visibility now follows:

1. `perm` is required unless null.
2. Primary atomic menu code is checked first.
3. `superPerm` remains supported for explicit super-menu use cases.
4. `altPerms` is supported only as a transition bridge for old coarse roles.

### Procurement menu atomization

Updated sidebar primary menu codes:

- Procurement dashboard: `MENU_PRC2_DASHBOARD`, fallback `MENU_PRC2`
- Supplier archive: `MENU_PRC2_SUPPLIER`, fallback `MENU_PRC2_MASTER`
- Procurement project: `MENU_PRC2_PROJECT`, fallback `MENU_PRC2_MASTER`
- Procurement request: `MENU_PRC2_REQUEST`, fallback `MENU_PRC2_MASTER`

Existing fine-grained leaves for orders, logistics, receipts, payments, shareholder funds, and historical initialization remain unchanged.

### Finance cash menu atomization

Updated sidebar primary menu codes:

- Cash account list: `MENU_FIN2_CASH_VIEW`, fallback `MENU_FIN2_CASH`
- Fund transfer: `MENU_FIN2_CASH_TRANSFER`, fallback `MENU_FIN2_CASH`

The finance cash page already controls account maintenance and cash transaction buttons through `MENU_FIN2_CASH_MASTER` and `MENU_FIN2_CASH_TXN`.

### Packaging terminal gate

The production-side packaging terminal shortcut is now gated by:

- `MENU_PKG_OP`, fallback `MENU_PKG_MGR`

It no longer appears just because another production child menu is visible.

### Home entry consistency

The operation cockpit cash card now uses `MENU_FIN2_CASH_VIEW` with legacy `MENU_FIN2_CASH` fallback, matching sidebar visibility.

## Remediation Opinion

### Immediate rule

No frontend menu, shortcut, high-risk button, or terminal entry should be rendered unless the user's effective JWT permissions include the corresponding menu code and action bit.

Parent directories should not be granted business meaning. They should only be shown when at least one authorized child exists.

### Required next remediation

1. Split procurement backend guards:
   - Supplier endpoints should prefer `MENU_PRC2_SUPPLIER`.
   - Project endpoints should prefer `MENU_PRC2_PROJECT`.
   - Request endpoints should prefer `MENU_PRC2_REQUEST`.
   - `MENU_PRC2_MASTER` may remain as a temporary fallback during role migration, but should be retired from direct UI visibility decisions.

2. Run role matrix reconciliation:
   - Verify 王乐金 and each pilot role have only the child menus required by their actual job.
   - Remove broad codes from roles where the atomic child code is enough.

3. Align page-level buttons:
   - The sidebar can hide pages, but each page still needs button-level checks for create/edit/approve/export/delete.
   - This is especially important for procurement, approval center, finance cash, and master data.

4. Add a navigation permission audit:
   - Compare frontend menu codes against `sys_menu`.
   - Flag hard-coded links that do not pass through menu permission helpers.
   - Flag coarse menu usage where an atomic code exists.

5. Long-term target:
   - Generate the navigable menu tree from backend `sys_menu` + effective role permissions, then let the frontend only render the authorized tree.
   - Keep hard-coded frontend menu metadata only for icon/layout hints.

## Risk

Risk level: LOW.

This change hides unauthorized UI entry points and preserves legacy coarse-code fallback for existing roles. It does not change database schema, backend business logic, or production data.

## Validation Requirements

- Web TypeScript check.
- API TypeScript check.
- W5 closeout gate.
- Manual role smoke for at least:
  - procurement-only user
  - finance cash view-only user
  - packaging operator
  - ordinary office/approval user


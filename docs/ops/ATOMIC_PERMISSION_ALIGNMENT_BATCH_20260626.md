# Atomic Permission Alignment Batch - 2026-06-26

## Scope

This batch continues the global RBAC/menu-gate cleanup for high-risk entrances. The goal is to stop exposing child menus, cockpit cards, and dashboard APIs through coarse parent permissions, while keeping limited backend transition fallbacks where old role grants may still exist.

Covered domains:

- Approval center
- Procurement
- Finance
- Master data
- Data quality
- Breeding master data

No database write, migration, seed, deploy, or production operation was executed in this batch.

## Changes

### Frontend Menu And Center Cards

- `apps/web/src/components/layout/Sidebar.tsx`
  - Procurement child menus now require atomic codes directly:
    - `MENU_PRC2_DASHBOARD`
    - `MENU_PRC2_SUPPLIER`
    - `MENU_PRC2_PROJECT`
    - `MENU_PRC2_REQUEST`
    - `MENU_PRC2_ORDER`
    - `MENU_PRC2_PAYMENT`
    - `MENU_PRC2_RECEIPT`
    - `MENU_PRC2_SHIPMENT`
    - `MENU_PRC2_FUND`
    - `MENU_PRC2_INIT`
  - Removed frontend visibility fallback from `MENU_PRC2` / `MENU_PRC2_MASTER`.
  - Finance overview now uses `MENU_FIN2_DASHBOARD` instead of `MENU_FIN2`.
  - Approval child menus no longer use coarse `MENU_WORKFLOW` fallback.

- `apps/web/src/app/(admin)/home/page.tsx`
  - Finance, procurement, and workflow shortcuts now resolve to the first actually accessible child menu.
  - Removed `MENU_PRC2`, `MENU_PRC2_MASTER`, `MENU_WORKFLOW`, and `MENU_MASTER` from shortcut visibility decisions.
  - Master data secondary CTA now points to the first visible master-data child path.

- `apps/web/src/app/(admin)/dashboard/page.tsx`
  - Dashboard redirect to finance now uses the first visible finance child path.
  - Finance quick link no longer depends on `MENU_FIN2`.
  - Procurement quick link no longer depends on `MENU_PRC2` / `MENU_PRC2_MASTER`.

### Frontend Page Guards

- `apps/web/src/app/(admin)/breeding/henhouse/page.tsx`
  - Fixed a guard bug where `MENU_DEVICE_MONITOR` was passed to role-based `can(role[])`.
  - Device action now checks `MENU_DEVICE_MONITOR:V`.

- `apps/web/src/app/(admin)/master-data/companies/page.tsx`
  - Company archive now uses `MENU_SYS_ORG:V` instead of legacy `MENU_MASTER:V`.

- `apps/web/src/app/(admin)/master-data/customers/[code]/page.tsx`
  - Customer detail now allows `MENU_MD_CUSTOMER:V` or `MENU_MASTER_DATA:V`.

- `apps/web/src/app/(admin)/master-data/suppliers/[code]/page.tsx`
  - Supplier detail now allows `MENU_MD_SUPPLIER:V` or `MENU_MASTER_DATA:V`.

- `apps/web/src/app/(admin)/master-data/operations/page.tsx`
  - Operations cockpit now allows `MENU_MD_CENTER:V` or `MENU_MASTER_DATA:V`.

- `apps/web/src/app/(admin)/master-data/governance/page.tsx`
  - Governance cockpit now allows `MENU_MD_QUALITY:V` or `MENU_MASTER_DATA:V`.

- `apps/web/src/app/(admin)/master/farms/page.tsx`
  - Farm master page now requires `MENU_FARM_MASTER:V` instead of `MENU_MASTER:V`.

### Backend Guards

- `apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts`
  - Procurement dashboard endpoints now prefer `MENU_PRC2_DASHBOARD:V`.
  - Widget-specific transition fallbacks are limited to relevant atomic menus, for example payment widgets also accept `MENU_PRC2_PAYMENT:V`.

- `apps/api/src/modules/procurement/procurement.controller.ts`
  - Removed class-level `MENU_PRC2:V`.
  - Added method-level atomic guards for legacy-compatible procurement endpoints:
    - dashboard: `MENU_PRC2_DASHBOARD:V`
    - requests: `MENU_PRC2_REQUEST:V`
    - orders: `MENU_PRC2_ORDER:V`
    - suppliers: `MENU_PRC2_SUPPLIER:V`
    - pending payments: `MENU_PRC2_PAYMENT:V`
    - receipt actions: `MENU_PRC2_RECEIPT:E`
  - Workflow fallback on approval/reject was tightened from `MENU_WORKFLOW` to `MENU_WORKFLOW_TODO`.

- `apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts`
  - Finance dashboard now prefers `MENU_FIN2_DASHBOARD:V`.
  - Read-only fallback is limited to finance atomic child menus during transition.

- `apps/api/src/modules/master-data/master-data-center.controller.ts`
  - Master data operations endpoints now prefer `MENU_MD_CENTER:V`.
  - Governance endpoints now prefer `MENU_MD_QUALITY:V`.

- `apps/api/src/modules/data-quality/data-quality.controller.ts`
  - Data quality API now prefers `MENU_MD_QUALITY:V`.

- `apps/api/src/common/guards/menu-registry.service.ts`
  - Added fallback registration for missing atomic menu codes used by guards:
    - `MENU_PRC2_SUPPLIER`
    - `MENU_PRC2_PROJECT`
    - `MENU_PRC2_REQUEST`
    - `MENU_FIN2_CASH_VIEW`
    - `MENU_FIN2_CASH_TRANSFER`
    - `MENU_FIN2_REIMBURSE`

## Risk Controls

- Frontend no longer renders high-risk child menu entries based only on coarse parent permissions.
- Backend transition fallbacks remain explicit and endpoint-specific.
- No role grants were modified in this batch.
- No DB writes or migrations were executed.

## Remaining Work

1. DB role matrix alignment:
   - Remove legacy parent-code grants from non-admin operational roles only after confirming all atomic grants exist.
   - Validate `sys_role_menu_permission` against the current sidebar and controller matrix.

2. Backend broad master-data references:
   - `GET /api/master-data/references/:objectType/:objectCode`
   - `POST /api/master-data/code/next`
   These remain guarded by `MENU_MASTER_DATA` because they are generic cross-type endpoints. A later pass should add runtime object-type-aware permission checks.

3. Legacy docs and historical reports still mention parent codes. They are not runtime code paths.

## Verification Plan

- API typecheck
- Web typecheck
- `git diff --check`
- W5 closeout gate


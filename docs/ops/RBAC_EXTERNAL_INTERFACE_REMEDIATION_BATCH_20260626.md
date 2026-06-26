# RBAC / External Interface Remediation Batch - 2026-06-26

## Scope

This batch continues the production-readiness cleanup for Phoenix ERP by closing three audit residuals:

1. Procurement historical initialization frontend gate still used `ROLE_ADMIN` checks.
2. Mobile daily dashboard module visibility still used hard-coded role arrays.
3. Chanjet generic call proxy had E permission and audit but still accepted broad accounting paths without an explicit allowlist.

## Changes

### Procurement initialization atom gate

File: `apps/web/src/app/(admin)/procurement2/init/page.tsx`

- Replaced `user?.role === "ROLE_ADMIN"` frontend action checks with `MENU_PRC2_INIT` action-bit checks.
- Upload validation now requires `MENU_PRC2_INIT:C`.
- Import execution now requires `MENU_PRC2_INIT:E`.
- Batch cancel now requires `MENU_PRC2_INIT:D`.
- This prevents role-name drift and allows properly authorized non-admin operators if the permission matrix grants them atom permissions.

### Mobile dashboard atom gate

File: `apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`

- Removed hard-coded role arrays for dashboard sections.
- Section visibility now derives from menu permissions:
  - Production: `MENU_FARM_DATA` / `MENU_FARM_DAILY` / `MENU_FARM_VET`
  - Packaging: `MENU_PKG_OP` / `MENU_PKG_MGR`
  - Quality: `MENU_QA_OP` / `MENU_QA_MGR` / `MENU_QA` / `MENU_MD_QUALITY`
  - Stock: `MENU_WMS_VIEW` / `MENU_WMS_INOUT` / `MENU_SALES2_INVENTORY`
  - Sales: `MENU_SALES2` / `MENU_SALES2_ORDER` / `MENU_SALES2_REPORT`
  - Alerts: `MENU_IOT` / `MENU_FARM_DATA`
  - Delivery: `MENU_SALES2_DELIVERY` / `MENU_LOGISTICS`
- This avoids leaking mobile dashboard sub-sections by role-name assumptions.

### Chanjet generic proxy hardening

File: `apps/api/src/modules/chanjet/chanjet-callback.controller.ts`

- Added explicit allowlist for generic proxy paths:
  - `/accounting/openapi/cc/book/`
  - `/accounting/openapi/cc/party/`
  - `/accounting/openapi/cc/department/`
  - `/accounting/gl/statistics/receive/`
- Rejects absolute URLs, path traversal, backslash paths, non-accounting paths, non-allowlisted paths.
- Enforces method normalization to `GET` / `POST` only.
- Keeps `MENU_SYS_CONFIG:E` requirement and existing audit logging.
- Rejected paths are audited as failed proxy attempts.

## Safety Results

- Business code changed: Yes, limited to RBAC/frontend-gate and Chanjet proxy safety.
- DB migration executed: No.
- DB write executed by this remediation: No.
- Deployment executed in this local batch: Pending CI/CD after push.
- Production push: Pending validation.

## Expected Impact

- Users without atom permissions should no longer see historical initialization actions or mobile dashboard sub-sections by accidental role matches.
- Users with correct atom permissions should retain access even if their role code is not hard-coded in the frontend.
- Chanjet manual proxy remains available for approved system configuration operators but cannot be used as an arbitrary external request tunnel.

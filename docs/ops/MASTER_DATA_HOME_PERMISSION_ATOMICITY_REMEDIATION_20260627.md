# Master Data / Home Permission Atomicity Remediation - 2026-06-27

## Scope

This batch continues the permission debt cleanup for non-module atomic RBAC and frontend gate alignment.

## Issues Fixed

1. Home sales shortcuts still used the coarse parent permission `MENU_SALES2`.
2. Business overview sales card still used `MENU_SALES2`, which could hide valid child-permission users or expose a parent-level shortcut incorrectly.
3. Master data reference graph endpoint used coarse `MENU_MASTER_DATA` as the direct endpoint guard.
4. Master data code generation endpoint used coarse `MENU_MASTER_DATA:C` as the direct endpoint guard.
5. `MasterDataTypeGuard` still accepted `MENU_SYS_ORG` as a per-type fallback for organization/company access.

## Changes

- Updated home sales shortcut/card to use `MENU_SALES2_DASHBOARD` with atomic sales child permissions as alternates.
- Added dynamic per-object permission checks for `/api/master-data/references/:objectType/:objectCode`.
- Added prefix-to-menu permission checks for `/api/master-data/code/next`.
- Removed coarse `MENU_SYS_ORG` fallback from `MasterDataTypeGuard`.
- Extended `scripts/ci/check-menu-permission-atomicity.mjs` to prevent regressions:
  - home sales shortcut/card cannot use `MENU_SALES2`;
  - master-data center endpoints cannot directly guard with `MENU_MASTER_DATA`;
  - `MasterDataTypeGuard` cannot reintroduce `MENU_SYS_ORG` fallback.

## Validation

- `node scripts/ci/check-menu-permission-atomicity.mjs`: PASS
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`: PASS
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS

## Risk

Risk level: Medium.

The changes reduce over-broad parent permission usage. Existing `MENU_MASTER_DATA` super-permission remains available as a controlled fallback in dynamic checks, while user-facing and endpoint primary gates now use atomic menus.

## Next

Continue global cleanup on remaining center cards, workflow/master-data approval registry metadata, and other high-risk parent-menu residues that are still semantically registry-only or comments.

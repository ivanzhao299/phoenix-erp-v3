# Role Permission Matrix Atomicity Apply

Date: 2026-06-27

## Goal

Continue production-readiness cleanup by removing non-admin coarse parent role grants after preserving access through atomic menu grants.

## Background

The latest role permission matrix audit reported 56 non-admin coarse parent grants across finance, procurement, workflow, master-data, and legacy settings menus. Code-level controller guards have already moved to atomic menu codes, so the remaining coarse grants mainly affect frontend visibility and cross-role menu exposure.

## Change

Added a TypeORM governance migration:

- `apps/api/src/database/migrations/1782052418112-RepairRolePermissionMatrixAtomicity.ts`

The migration:

1. Ensures required atomic `sys_menu` rows exist.
2. Converts non-admin coarse grants into atomic child grants.
3. Removes non-admin grants on these coarse parent menus:
   - `MENU_FIN2`
   - `MENU_PRC2`
   - `MENU_PRC2_MASTER`
   - `MENU_WORKFLOW`
   - `MENU_MASTER`
   - `MENU_SETTINGS_IT`
4. Preserves `ROLE_ADMIN` coarse grants.
5. Provides a `down()` path that restores coarse grants from current atomic grants without deleting atomic rows.

## Boundary

- No business code changed in this batch.
- No frontend behavior changed in this batch.
- DB writes are limited to `sys_menu` and `sys_role_menu_permission`.
- No seed/reset/cleanup command is introduced.
- The migration will run through the standard TypeORM migration chain during deployment.

## Risk

Risk is medium because role grants affect global user visibility. The migration is compatibility-first: it grants child permissions before deleting parent permissions. This avoids breaking current users while removing the broad parent grants that cause menu/permission confusion.

## Rollback

Run the migration `down()` to restore non-admin coarse grants inferred from atomic grants. Atomic menu rows and grants are intentionally not deleted by `down()` because they are the preferred production permission model.

## Validation Plan

- API typecheck
- Web typecheck
- menu permission atomicity gate
- sensitive menu guard gate
- frontend menu gate
- TypeORM migration no-data-DML gate
- TypeORM migration down gate
- nullable unique gate
- W5 closeout gate
- production smoke after deployment

## Current Conclusion

`GO WITH CONDITIONS`

This clears a major role-permission debt layer. A later role-owner pass can further tighten exact role duties, but the broad parent grants are no longer needed for non-admin roles.

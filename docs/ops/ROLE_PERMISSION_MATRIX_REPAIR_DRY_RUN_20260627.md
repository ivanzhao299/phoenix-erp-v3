# Role Permission Matrix Repair Dry Run - 2026-06-27

## Goal

Continue the production-readiness cleanup for menu/RBAC debt by preparing a controlled database-side repair path for coarse parent role grants.

The previous code batch removed many coarse permission fallbacks from backend controllers and generic CRUD mapping. This dry-run covers the next layer: roles still holding parent grants such as `MENU_FIN2`, `MENU_PRC2`, `MENU_PRC2_MASTER`, `MENU_WORKFLOW`, `MENU_MASTER`, and `MENU_SETTINGS_IT`.

## Files Added

- `scripts/ops/repair-role-permission-matrix.mjs`
- `docs/ops/runs/role-permission-matrix-repair-latest.json`
- `docs/ops/runs/role-permission-matrix-repair-latest.md`

## Script Behavior

`repair-role-permission-matrix.mjs` is a transaction-safe repair runner.

Default mode is dry-run. It does not write DB data unless explicitly called with `--apply`.

In apply mode it will:

1. Ensure required atomic `sys_menu` rows exist for finance, procurement, master-data, workflow, and settings.
2. Expand non-admin parent menu grants into mapped atomic grants.
3. Remove non-admin grants on known coarse parent menu codes.
4. Preserve `ROLE_ADMIN` parent grants.
5. Generate JSON and Markdown audit reports.

The script does not run migration commands, deploy, push, reset, cleanup, or production operations.

## Dry-run Result

Command:

```bash
node scripts/ops/repair-role-permission-matrix.mjs --dry-run --output-dir=docs/ops/runs
```

Result:

- Decision: `DRY_RUN_READY`
- Menu rows to insert/update: `1`
- Atomic grant upserts planned: `433`
- Coarse non-admin grants planned for removal: `56`
- DB writes executed: `no`
- Migration executed: `no`
- Deploy executed: `no`
- Push executed by script: `no`

## Why Apply Was Not Executed In This Batch

The dry-run shows that a broad compatibility expansion would preserve access by converting each parent grant into child grants. That is safer than deleting parent grants without replacement, but it is not the same as final least-privilege role design.

Example: a role with `MENU_FIN2:V` would be expanded to many finance child menus with view access. This avoids breaking existing users, but a later role-owner pass should reduce access to the exact duties of each role.

Therefore this batch records the controlled repair path and keeps DB writes for a dedicated approval/execution gate.

## Validation

- `node --check scripts/ops/repair-role-permission-matrix.mjs`: PASS
- `node scripts/ops/repair-role-permission-matrix.mjs --dry-run --output-dir=docs/ops/runs`: PASS
- `node scripts/ci/check-menu-permission-atomicity.mjs`: PASS
- `ALLOW_FREEZE_TOUCH=true ALLOW_SECURITY_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs`: PASS

## Remaining Cleanup

1. Run this script against the target environment in dry-run mode.
2. Review planned broad compatibility expansion for high-risk roles.
3. Apply only after confirming target `sys_menu` inventory and rollback plan.
4. Run role-specific least-privilege tightening after parent grants are removed.
5. Re-login smoke high-impact users and verify left menu, center cards, high-risk buttons, approval, procurement, finance, master-data, and settings.

## Current Conclusion

`GO WITH CONDITIONS`

The repair path is ready. Direct DB apply is intentionally held for a separate controlled execution gate because role grants affect user access globally.

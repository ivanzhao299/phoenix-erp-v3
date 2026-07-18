# BUGTASK-20260718-0005 Backend Repair Report

## Result

**PASS WITH CONDITIONS — HOLD production resolution claim.**

The backend RBAC mismatch identified by the intake classifier is repaired and covered by a focused regression test. CI/CD, a production smoke test at `/terminal/packaging/source-receive`, and business acceptance have not run, so this report does not claim that BUG-20260718-0005 is resolved in production.

## Source bug

- Bug: `BUG-20260718-0005`
- Symptom: submitting egg quantities from the collection workbench reports an internal server error.
- Actual acceptance route: `/terminal/packaging/source-receive`
- Intake snapshot route: `/finance2/ar-ledger` (the feedback dialog was captured from a different page, so it does not reproduce the failing request).
- Intake classification: `RBAC_403`, confidence `0.9`.

## Root cause

The packaging workbench read endpoints require `MENU_PACKAGING:V`, and the existing RBAC data grants workbench roles create/edit permissions on `MENU_PACKAGING`. However, `POST /api/packaging/shifts/:id/complete` required only `MENU_PKG_MGR:C`. A user could therefore enter the workbench and hold its create permission but be denied when confirming collection.

The repair preserves least privilege: completion still requires create permission. It accepts either `MENU_PKG_MGR:C` or `MENU_PACKAGING:C`; view-only users remain denied. `MenuGuard`, `DataScopeGuard`, service behavior, audit fields, and inventory transaction behavior are unchanged.

The reporter snapshot names `ROLE_ADMIN`, which the current `MenuGuard` bypasses. Because the supplied evidence contains no failed request/status or server log and was captured from another route, this source alone cannot prove that RBAC was the only production failure. Production smoke remains required.

## Changed files

- `apps/api/src/modules/terminal/packaging.controller.ts`
  - Added `MENU_PACKAGING` as an alternate menu for the existing `C` permission requirement on collection completion.
- `apps/api/src/modules/terminal/packaging.controller.spec.ts`
  - Added a focused metadata regression test for the endpoint's exact RBAC contract.
- `docs/ops/BUGTASK-20260718-0005-backend-repair.md`
  - This report.

No web, migration, schema, entity, table, or column files changed. No database write, deploy, push, or migration execution was performed.

## Validation

From `apps/api`:

```bash
./node_modules/.bin/jest src/modules/terminal/packaging.controller.spec.ts --runInBand
```

Result: PASS — 1 suite, 1 test.

```bash
./node_modules/.bin/tsc --noEmit
```

Result: PASS — exit code 0, no diagnostics.

Static evidence:

- `MENU_PACKAGING` and `MENU_PKG_MGR` are both registered backend menu codes.
- Existing RBAC baselines grant `MENU_PACKAGING:C` to workbench roles.
- The alternate-menu path is enforced by the existing `MenuGuard` with the same requested permission (`C`), so it does not downgrade authorization to `V`.

## Release conditions

1. CI must pass on the integrated commit.
2. Smoke with a non-admin packaging-workbench user holding `MENU_PACKAGING:C` and confirm the endpoint is not 403.
3. Smoke the original egg quantity submission against production-compatible data and inspect the actual HTTP status/server log if it still fails.
4. Business owner must confirm the generated grading task and inventory effects are correct.

Until all four are satisfied: **HOLD**.

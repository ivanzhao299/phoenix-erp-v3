# Workflow RBAC Atomic Permission Remediation - 2026-06-25

## Objective

Resolve coarse workflow permission leakage where users could see approval-center children or hit workflow endpoints through the broad `MENU_WORKFLOW` permission. The remediation splits approval/workflow capabilities into atomic menu permissions and aligns sidebar visibility, page-level guards, controller guards, and role backfill.

## New Atomic Menu Codes

| Menu Code | Scope | Primary Actions |
| --- | --- | --- |
| `MENU_WORKFLOW_TODO` | My approval tasks and actions | `V/C/E/A` |
| `MENU_WORKFLOW_HISTORY` | Completed/history views | `V` |
| `MENU_WORKFLOW_NOTIFY` | Workflow notification center | `V/E` |
| `MENU_WORKFLOW_CONFIG` | Approval flow configuration | `V/C/E/D` |
| `MENU_WORKFLOW_RULES` | Approval rule configuration | `V/C/E/D` |
| `MENU_WORKFLOW_FORM` | Workflow form/runtime form management | `V/C/E` |
| `MENU_WORKFLOW_METRICS` | Approval health/metrics dashboards | `V/X` |

## Changes

- Added TypeORM migration `1782045418112-SeedWorkflowAtomicMenus.ts` to register atomic workflow menu codes and backfill role permissions from legacy `MENU_WORKFLOW`.
- Updated workflow/approval/notification controllers to use atomic `@RequireMenu()` decorators with explicit action bits.
- Kept `MENU_WORKFLOW` as an `altMenus` fallback during the transition so already-authorized legacy roles do not lose access before the migration is applied.
- Updated sidebar children under Approval Center to use atomic menu codes; parent visibility is still derived from visible children, so unauthorized children are not rendered.
- Updated daily workbench, home shortcuts, workflow settings pages, form runtime page, and metrics page to check the corresponding atomic menu code.
- Extended `scripts/ci/check-menu-permission-atomicity.mjs` to fail on empty `@RequireMenu` action bits and direct coarse `MENU_WORKFLOW` controller guards in workflow/approval/notification controllers.

## Role Matrix Alignment

| Role/Permission Intent | Allowed Menus |
| --- | --- |
| Normal approver | `MENU_WORKFLOW_TODO`, `MENU_WORKFLOW_HISTORY`, `MENU_WORKFLOW_NOTIFY` |
| Workflow operator/configurer | Normal approver set + `MENU_WORKFLOW_CONFIG`, `MENU_WORKFLOW_RULES`, `MENU_WORKFLOW_FORM` |
| Workflow auditor/manager | History + metrics, using `MENU_WORKFLOW_METRICS:X` for dashboards |
| Admin/super role | Full set, still audited by menu registration and runtime logs |

## Risk Controls

- No business data write in application code.
- Migration only writes `sys_menu` and `sys_role_menu_permission` for RBAC configuration.
- No production deployment command is embedded in this change.
- Legacy fallback is intentional and temporary; after role matrix verification, a later cleanup can remove `MENU_WORKFLOW` fallbacks.

## Verification Plan

- `node scripts/ci/check-menu-permission-atomicity.mjs`
- `bash scripts/check-ts-migration-no-data-dml.sh`
- API typecheck
- Web typecheck
- W5 closeout gate

## Follow-Up

1. Verify production role assignments after migration executes.
2. Remove or further restrict `MENU_WORKFLOW` fallback once all roles have atomic permissions.
3. Continue the same atomic pass for remaining coarse parent domains: WMS, sales/store, system settings, and BI.

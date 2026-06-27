# Org User Extra Scope DataScope Guard

Date: 2026-06-26

## Background

The organization administration APIs already apply company-scoped visibility to organization tree reads and direct organization mutations. The remaining gap was the extra authorization surface for project and warehouse scopes:

- user project scope assignment
- user project scope removal
- user warehouse scope assignment
- user warehouse scope removal
- user extra scope listing

Without a write-side scope guard, an operator with limited company scope could assign or inspect extra project / warehouse scopes outside their permitted company boundary if the endpoint was reachable.

## Change Summary

Updated `apps/api/src/modules/org/services/org.service.ts`:

- Added company-scoped validation for `biz_projects.project_code`.
- Added company-scoped validation for `wms_warehouses.warehouse_code`.
- Filtered `getUserScopes()` by the current operator's visible project and warehouse codes.
- Guarded `addProjectScope()` and `removeProjectScope()`.
- Guarded `addWarehouseScope()` and `removeWarehouseScope()`.

## Guard Rules

- Global data scope can manage all project and warehouse extra scopes.
- Non-global users can only list / assign / remove project and warehouse scopes whose `company_code` is inside their resolved organization company DataScope.
- Empty or unresolved scope fails closed with `DATA_SCOPE_DENIED`.
- Missing or archived project / warehouse codes are rejected.

## Table Handling

- `biz_projects` uses `deleted_at IS NULL` and non-archived status checks.
- `wms_warehouses` uses company and non-archived status checks. No soft-delete column is assumed for this table.

## Risk Reduction

This closes a cross-company authorization-management gap without changing schema, migrations, frontend code, production deployment logic, or existing business data.

## Boundaries

- Business code touched: API organization service only.
- Schema changed: No.
- Migration added or executed: No.
- Database write executed: No.
- Deployment executed by this change: Pending CI/CD after merge.

## Verification

Planned local verification:

- API typecheck.
- Web typecheck.
- `git diff --check`.
- W5 closeout gate with authorized security boundary flags.


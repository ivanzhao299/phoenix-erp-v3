# Biz Projects DataScope Gate Remediation — 2026-06-26

## Scope

This remediation tightens the `/api/biz/projects` project selector endpoints used by procurement payment and related purchase forms.

## Problem

`BizProjectsController.companyScope()` contained local bypass checks for `permissions.includes('*')`, `username === 'admin'`, `ROLE_ADMIN`, and `user.roles.includes('ROLE_ADMIN')`. That made project visibility depend on controller-local role assumptions instead of the common MenuGuard + DataScopeGuard flow.

The practical risk is drift: project options can become broader than the user's actual data domain when the endpoint is reused by high-frequency purchase/payment forms.

## Fix

- Added `DataScopeGuard` to `BizProjectsController`.
- Read the resolved `DataScopeContext` from CLS first.
- Removed local `admin`, `ROLE_ADMIN`, and `*` bypass logic from the controller.
- Kept fallback `DataScopeService.resolve()` for compatibility if CLS scope is unavailable.
- Kept existing menu gate: `MENU_PRC2_PROJECT:V` or `MENU_MASTER_DATA`.

## Changed Files

- `apps/api/src/modules/master-data/biz-projects.controller.ts`
- `docs/ops/BIZ_PROJECTS_DATASCOPE_GATE_REMEDIATION_20260626.md`

## Validation Plan

- API typecheck.
- Web typecheck.
- W5 closeout gate.
- CI/CD deployment after push.
- Production health smoke after deploy.

## Business Impact

Procurement payment project selector should now reflect the user's authorized project/company data domain. Users without project/company scope receive an empty list instead of leaked options.

## Safety

- Business code changed: yes, backend endpoint gate logic only.
- Migration executed: no.
- Schema/entity/table/column changed: no.
- DB write executed: no.
- Production deploy: only through CI/CD after validation.

## Result

Pending validation at report creation time.

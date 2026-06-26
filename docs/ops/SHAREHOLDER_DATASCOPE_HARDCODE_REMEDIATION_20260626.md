# Shareholder DataScope Hardcode Remediation

Date: 2026-06-26

## Scope

This batch tightens shareholder project visibility and removes role-name based global visibility from the shareholder runtime service.

## Problem

The shareholder runtime previously granted full project visibility when the current user had one of these role codes:

- `ROLE_ADMIN`
- `ROLE_FIN_CFO`
- `ROLE_HQ_FINANCE`

That bypassed the current DataScope model and made the effective visibility depend on coarse roles rather than menu permission plus data-domain scope.

In addition, `GET /api/shareholders/projects` and `GET /api/shareholders/projects/:projectCode` did not pass the current user into service-level scope filtering, so a user with shareholder view permission could receive the full project list even if dashboard and capital endpoints were scoped.

## Changes

Modified files:

- `apps/api/src/modules/shareholder/controllers/shareholder.controller.ts`
- `apps/api/src/modules/shareholder/services/shareholder.service.ts`

## Gate Alignment

Controller:

- Added `DataScopeGuard` to `api/shareholders`.
- Project list/detail now pass current user context to the service.

Service:

- Removed `ROLE_*` global visibility shortcut.
- Uses `dataScope` from CLS as the primary visibility source:
  - `isGlobal` -> all shareholder projects.
  - `allowedProjectCodes` -> exact project visibility.
  - `allowedCompanyCodes` -> projects under those companies.
  - `allowedSiteCodes` -> projects under those sites.
- Keeps `shr_shareholder_scopes` as the shareholder-specific visibility layer and unions it with DataScope project/company/site access.

## Risk Reduction

- Users no longer see shareholder projects solely because of a broad finance or admin-ish role code.
- Project list, project detail, equity, contribution, dashboard, capital, beneficial-equity, and finance bridge now share the same project-scope basis.
- A user with menu visibility but no configured data/shareholder scope gets an empty project set instead of a full leak.

## Not Changed

- No schema change.
- No migration.
- No DB write.
- No frontend change.
- No deployment script change.

## Validation

Required validation:

- API typecheck.
- Web typecheck.
- W5 closeout gate.
- CI/CD after push.
- Production API health smoke after deployment.

## Result

Conclusion: GO WITH CONDITIONS.

Condition: `ROLE_ADMIN` still receives global DataScope through `DataScopeService` by design. A later cleanup should review whether `ROLE_ADMIN` should remain a global runtime role or be constrained to explicit permission-set plus sys_user_orgs bindings.

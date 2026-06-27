# Lookup Shareholder Selector DataScope Remediation - 2026-06-26

## Scope

- Endpoint: `GET /api/lookup/shareholders`
- Risk domain: finance selector visibility / shareholder capital entry / DataScope

## Problem

The shareholder lookup endpoint was intentionally JWT-only so finance entry users could select shareholders without master-data menu permissions. However, when `companyCode` was omitted it returned all active shareholders, which could expose cross-company shareholder names to scoped users.

## Fix

- Resolve the current user's DataScope inside the lookup endpoint.
- Non-global users with no company or site scope now receive an empty list.
- If `companyCode` is provided, the result must match both the requested company and the user's DataScope.
- If `companyCode` is omitted, non-global users only see shareholders connected to visible projects through `shr_project_equity -> shr_projects`.
- Scope is enforced through:
  - `shr_projects.company_code IN allowedCompanyCodes`
  - `shr_projects.site_code IN allowedSiteCodes`

## Guardrails

- No schema change.
- No migration.
- No business data write.
- No frontend behavior change in this patch.
- Global users keep the historical all-active-shareholders lookup.

## Validation

- API typecheck: PASS
- Web typecheck: PASS
- `git diff --check`: PASS
- W5 closeout gate: PASS
- CI/CD: pending after push

# Lookup Poultry Selector DataScope Remediation - 2026-06-26

## Scope

- Endpoint: `GET /api/lookup/houses`
- Endpoint: `GET /api/lookup/flocks`
- Risk domain: RBAC / DataScope / frontend selector visibility

## Problem

`/api/lookup/houses` and `/api/lookup/flocks` were JWT-only lookup endpoints used by business entry pages. They accepted optional `farmCode` / `siteCode` query filters, but if a frontend page omitted those filters the backend could return all active poultry houses or flocks.

That behavior conflicts with the production rule that unauthorized child data must not be visible merely because the frontend forgot to pass a filter.

## Fix

- Resolve the current user's DataScope in the lookup controller.
- For non-global users with no company, farm, or site scope, return an empty list.
- Scope houses by:
  - `allowedFarmCodes`
  - `allowedSiteCodes`
  - `allowedCompanyCodes` via `brd_farms.company_code`
- Scope flocks by:
  - `allowedFarmCodes`
  - `allowedSiteCodes` on `brd_flocks.site_code`
  - `allowedSiteCodes` via linked `brd_houses.site_code`
  - `allowedCompanyCodes` via `brd_farms.company_code`

## Guardrails

- No schema change.
- No migration.
- No business data write.
- No frontend behavior change in this patch.
- Global users keep full active lookup behavior.
- Non-global users fail closed when no applicable scope exists.

## Validation

- API typecheck: PASS
- Web typecheck: PASS
- `git diff --check`: PASS
- W5 closeout gate: PASS
- CI/CD: pending after push

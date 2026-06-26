# Org Service Direct Access DataScope Guard - 2026-06-26

## Scope

This remediation closes direct organization access paths that could bypass list-level DataScope filtering.

Affected service:

- `apps/api/src/modules/org/services/org.service.ts`

## Issue

The organization tree list was already scoped by company subtree. However, older management endpoints under `/api/org/*` can call service methods directly by organization id or user-org relation id.

Without service-level checks, a controller or future endpoint could accidentally expose:

- direct organization read by id;
- organization member list;
- user organization bindings;
- organization update / delete;
- user organization assign / update / remove.

## Fix

Added service-level visibility enforcement:

- `getOrg()` now verifies the requested organization is in the current user's visible company subtree.
- `getOrgByCode()` now uses the same visibility check.
- `getOrgTree()` delegates to `listOrgs()` instead of returning all organizations.
- `createOrg()` validates parent/company placement against writable scope.
- `updateOrg()` validates requested company change and new parent visibility.
- `deleteOrg()` checks visibility before destructive action.
- `getOrgMembers()`, `getUserOrgs()`, `assignUserOrg()`, `updateUserOrg()`, and `removeUserOrg()` now restrict organization bindings to visible organizations.

Global/internal calls keep existing behavior. Scope resolution failure remains fail-closed.

## Risk

Medium. This can surface existing role/data-scope misconfiguration as `404`/`DATA_SCOPE_DENIED` instead of allowing cross-company organization management.

## Validation

Planned validation:

- API typecheck
- Web typecheck
- W5 closeout gate
- `git diff --check`

## Production Impact

No migration, no DB write, no deploy script change. The change only tightens organization authorization logic.

# Org Service Read Scope Bypass Guard

Date: 2026-06-26

## Background

After tightening direct organization access and extra project / warehouse assignments, the remaining service-level read surface still had two bypass risks:

- `getOrgsByType()` used a direct repository query and did not inherit `listOrgs()` company DataScope filtering.
- `getUserOrgScopes()` read a target user's organization bindings without filtering those bindings by the current operator's visible organization tree.

These methods may be called by current or future controller paths. The service layer should therefore enforce the same DataScope boundary even when a controller already performs filtering.

## Change Summary

Updated `apps/api/src/modules/org/services/org.service.ts`:

- `getOrgsByType()` now filters from `listOrgs()` so it only returns organizations visible to the current operator.
- `getUserOrgScopes()` now restricts returned organization buckets to the current operator's visible organization ids.
- Empty or denied organization scope returns empty buckets instead of leaking target user authorization structure.

## Guard Rules

- Global users can still view all organization type and target user scope buckets.
- Non-global users only see organization type results inside their DataScope-visible subtree.
- Non-global users only see a target user's organization scope buckets that overlap their visible org ids.
- Denied scope fails closed with empty results.

## Risk Reduction

This reduces cross-company metadata leakage in system organization administration and keeps role / menu visibility audits aligned with backend data access behavior.

## Boundaries

- Business code touched: API organization service only.
- Frontend changed: No.
- Schema changed: No.
- Migration added or executed: No.
- Database write executed: No.

## Verification

Planned local verification:

- API typecheck.
- Web typecheck.
- `git diff --check`.
- W5 closeout gate with authorized security boundary flags.


# Production 95 Cleanup Batch - Procurement Init Batch DataScope

Date: 2026-07-01

## Objective

Close a remaining procurement DataScope debt item before continuing wider production-readiness cleanup. The target is the Procurement V2 historical initialization/import batch surface, which is a high-risk operational tool because it can stage and import procurement, payment, shareholder fund, and receipt history.

## Finding

`apps/api/src/modules/procurement-v2/services/init.service.ts` already runs behind `MenuGuard` and `DataScopeGuard`, but `prc2_init_batches` does not currently carry `company_code`, `project_code`, or `warehouse_code`. That means normal company/project DataScope filters cannot be applied directly to the batch list and subresources.

Before this cleanup, the following paths loaded batches by `id` or listed all batches without an explicit per-user fallback:

- batch list
- batch detail
- error rows
- cancel batch
- import batch

## Remediation

Implemented a fail-closed fallback for non-global users:

- GROUP/admin scope keeps full audit visibility.
- Non-global users can only list, inspect, cancel, or import batches they created.
- The rule is enforced in the service layer, not only in the controller.
- No schema change was made.
- No migration was created or executed.

This is intentionally conservative. A richer company/project scoped initialization-batch model should be handled later through a schema-gated design if the business requires delegated batch review by company or project.

## CI Gate

Updated `scripts/ci/check-procurement-datascope-writes.mjs` so the procurement DataScope gate now asserts:

- initialization batch list applies creator scope for non-global users
- initialization batch detail/error/cancel/import enforce creator access
- global/admin scope remains the only full-audit bypass

## Files Changed

- `apps/api/src/modules/procurement-v2/services/init.service.ts`
- `scripts/ci/check-procurement-datascope-writes.mjs`
- `docs/ops/PRODUCTION_95_CLEANUP_BATCH_20260701_PROCUREMENT_INIT_DATASCOPE.md`

## Validation

| Check | Result |
| --- | --- |
| `node --check scripts/ci/check-procurement-datascope-writes.mjs` | PASS |
| `node scripts/ci/check-procurement-datascope-writes.mjs` | PASS |
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS |
| `ALLOW_FREEZE_TOUCH=true node scripts/ci/check-w5-closeout-gate.mjs` | PASS |

## Safety

- Business code changed: yes, API DataScope enforcement only.
- Frontend changed: no.
- Migration created: no.
- Migration executed: no.
- DB write executed: no.
- Deploy status: pending CI/CD after push.

## Current Conclusion

GO WITH CONDITIONS.

The immediate cross-user initialization-batch exposure is closed. The condition is that any future need for company/project scoped batch delegation must go through an explicit schema gate instead of weakening this creator-scope fallback.

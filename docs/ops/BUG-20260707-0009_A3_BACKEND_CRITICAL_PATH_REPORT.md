# BUG-20260707-0009 A3 Backend Critical Path Report

## Result

PASS WITH CONDITIONS / Backend GO.

The backend defect was reproduced by code diagnosis: medicine inbound/outbound wrote ledger rows after an `UPDATE inv_batches WHERE batch_no = ...` that could affect zero rows. In that state the API returned success while stock stayed `0`.

## Changed Files

- `apps/api/src/modules/farm/farm-medicine.service.ts`
- `apps/api/src/modules/farm/farm-medicine.service.spec.ts`
- `docs/ops/BUG-20260707-0009_A3_BACKEND_CRITICAL_PATH_REPORT.md`

## APIs Covered

- `POST /api/farm/medicine/inbound`
  - Now runs in a transaction.
  - Creates or increments `inv_batches` through `INSERT ... ON CONFLICT DO UPDATE`.
  - Rejects inactive or missing medicine codes before ledger write.
  - Writes `MED_INBOUND` ledger only after stock row mutation succeeds.
- `POST /api/farm/medicine/outbound`
  - Now runs in a transaction.
  - Requires an existing medicine stock row.
  - Deducts `qty` and `qty_available`.
  - Writes `MED_OUTBOUND` ledger only after stock row mutation succeeds.
- `GET /api/farm/medicine/stock`
  - No route or response contract change.

## RBAC / DataScope / Audit Coverage

- RBAC unchanged: controller remains guarded by `MenuGuard` and `@RequireMenu('MENU_FARM_VET', 'V'/'E')`.
- DataScope guard unchanged: controller remains guarded by `DataScopeGuard`.
- DataScope write coverage strengthened: service now calls `DataScopeHelper.assertWritableWarehouse('MEDICINE', '药品库存')` before inbound/outbound writes.
- Audit trail preserved: existing `inv_ledger` write remains the append-only stock movement record.
- Attachment ACL not applicable: these APIs do not accept attachment input.

## Validation Commands

- `pwd` — PASS: `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`
- `git branch --show-current` — PASS: `w5-a3-backend-critical-path`
- `git status --short` before edits — PASS: clean
- `git log --oneline --decorate -8` — PASS: branch history readable
- `cd apps/api && pnpm test -- farm-medicine.service.spec.ts --runInBand` — PASS: 4 tests passed
- `cd apps/api && ./node_modules/.bin/tsc --noEmit` — PASS: 0 errors
- `cd apps/web && ./node_modules/.bin/tsc --noEmit` — FAIL, unrelated existing dependency issue: `vitest` and `vitest/config` types/modules are missing for web test/config files.
- Scope audit by targeted source read/grep — PASS:
  - `apps/api/src/modules/farm/farm-medicine.controller.ts` keeps `MenuGuard`, `DataScopeGuard`, and `MENU_FARM_VET`.
  - `apps/api/src/modules/farm/farm-medicine.service.ts` now enforces `assertWritableWarehouse`.

## Blockers

- No backend blocker.
- Release/UAT condition: Web `tsc --noEmit` currently fails before touching any frontend code because `vitest` is unresolved in `apps/web`.
- Commit condition: `git add` is blocked by the execution sandbox because this worktree's git metadata resolves to `/Users/mac/phoenix-erp/.git/worktrees/a3-backend-critical-path/index.lock`, which is outside the writable roots. No commit was created.

## Frozen-Item Statement

- No migration created or executed.
- No schema, entity, table, or column change.
- No database write performed.
- No production deploy, push, merge, or task-board update.
- No commit created because git index writes were blocked by sandbox permissions.
- No frontend file changed.
- No DataScope service or guard rewrite.

## Next Review Request

- A2 Security Regression Gate: review RBAC/DataScope impact of adding service-level warehouse write assertion for the `MEDICINE` stock bucket.
- A1 CI Runtime Gate: rerun backend tests and decide whether Web `vitest` dependency failure is already tracked or must block this bug release.

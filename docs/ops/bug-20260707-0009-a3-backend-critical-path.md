# BUG-20260707-0009 A3 Backend Critical Path Report

## Result

GO / PASS

Dry-run diagnosis found the backend stock overview query was not aggregating medicine stock by `product_code`. If the same medicine had multiple `inv_batches` rows under the `MEDICINE` warehouse, a later zero row could overwrite the non-zero quantity in the service map. The read path also created empty `inv_batches` rows during `GET /api/farm/medicine/stock`, which is unsafe for a read endpoint and conflicts with the no-DB-write guardrail.

## Changed Files

- `apps/api/src/modules/farm/farm-medicine.service.ts`
- `apps/api/src/modules/farm/farm-medicine.service.spec.ts`
- `docs/ops/bug-20260707-0009-a3-backend-critical-path.md`

## APIs Covered

- `GET /api/farm/medicine/stock`
  - Now reads active medicines from `brd_medications`.
  - Now aggregates `inv_batches` stock with `SUM(COALESCE(qty_available, qty, 0)) GROUP BY product_code`.
  - No longer inserts zero-stock `inv_batches` rows during stock reads.
- `POST /api/farm/medicine/inbound`
  - Keeps existing upsert behavior on `MED-STOCK-<medication_code>`.
  - Hardens historical-null handling with `COALESCE(inv_batches.qty, 0) + EXCLUDED.qty`.
- `POST /api/farm/medicine/outbound`
  - Existing decrement and ledger behavior unchanged.

## RBAC / DataScope / Audit Coverage

- RBAC preserved: controller remains guarded by `MenuGuard` and `@RequireMenu('MENU_FARM_VET', 'V'|'E')`.
- DataScope preserved: controller still uses `DataScopeGuard`; write paths still call `assertWritableWarehouse('MEDICINE', '药品库存')`.
- Audit preserved: inbound/outbound still write domain audit rows to `inv_ledger` with `MED_INBOUND` / `MED_OUTBOUND`, operator, log date, warehouse, note, and house code where applicable.
- Attachment ACL: not applicable; medicine stock endpoints do not accept attachments.

## Validation Commands

- `pwd`: PASS, `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`
- `git branch --show-current`: PASS, `w5-a3-backend-critical-path`
- `git status --short`: PASS before work, clean
- `git log --oneline --decorate -8`: PASS
- `cd apps/api && ./node_modules/.bin/jest src/modules/farm/farm-medicine.service.spec.ts --runInBand`: PASS, 5 tests passed
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`: PASS, 0 errors
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: BLOCKED by pre-existing missing dev dependency/type modules: `vitest`, `vitest/config`
- `git diff --check`: PASS
- Forbidden scope static check for migration/schema DDL keywords in changed backend files: PASS, no migration/schema/entity/table/column changes
- Security guard static check: PASS, existing `MenuGuard`, `DataScopeGuard`, `RequireMenu`, `assertWritableWarehouse`, and `inv_ledger` hooks are present

## Frozen-Item Statement

- No migrations created or executed.
- No schema/entity/table/column changes.
- No production deploy.
- No database writes executed by this agent.
- No frontend files changed.
- No task board updates.
- No push.

## Blockers

None for A3 backend scope. Web typecheck remains blocked by missing `vitest` dependencies/types in this worktree.

## Next Review Request

A1 should run integrated API/Web smoke in a dependency-complete environment after A4 frontend cache/tab-flow changes are combined, verifying:

- Today inbound save returns success and the matching medicine stock quantity increases.
- Today outbound save returns success and the matching medicine stock quantity decreases.
- Non-`MENU_FARM_VET:E` users cannot submit inbound/outbound.

# BUG-20260721-0001 A3 Backend Repair Report

## Result

**PASS WITH CONDITIONS / HOLD**

The local backend repair and focused regression verification pass. Keep the bug in
HOLD until CI/CD, a production smoke check, and business acceptance confirm the
collection and grading displays on the real route. This report does not claim the
production bug is resolved.

## Source

- Bug: `BUG-20260721-0001`
- Repair task: `BUGTASK-20260721-0001`
- Issue: 作业台-分级，采集数量和剩余数量有问题
- Acceptance example: total collected 800, dirty 10, cracked 10; collection must
  remain 800 and the initial gradable balance must be 780, not 760.

## Root cause

`PackagingTerminalBffController.receiveBatch` persisted `received_qty` as the
net quantity after subtracting dirty and cracked eggs. The grading flow treated
the defect quantities as a separate deduction, so the same 20 defects could be
deducted twice: `800 - 20 - 20 = 760`.

This was a field-semantics error in the backend, not a PostgreSQL schema defect.
No schema, entity, migration, seed, or database write is required.

## Repair

- Preserve `received_qty` as the total physically collected/received quantity.
- Validate that submitted `received_qty` equals `total_qty`.
- Compute the gradable quantity explicitly as
  `SUM(total_qty - dirty_qty - cracked_qty)` when validating grading output.
- Apply the same total-quantity semantics to source-batch corrections.
- Keep existing RBAC decorators, audit logging, and query scope unchanged.

## Changed files

- `apps/api/src/modules/bff/bff.controller.ts`
- `apps/api/src/modules/bff/bff.controller.spec.ts`
- `docs/ops/BUG-20260721-0001-a3-backend-repair.md`

## Validation

1. Focused regression test:

   `cd apps/api && ./node_modules/.bin/jest src/modules/bff/bff.controller.spec.ts --runInBand`

   Result: PASS, 1 suite / 6 tests.

2. API typecheck:

   `cd apps/api && ./node_modules/.bin/tsc --noEmit`

   Result: PASS, exit code 0, no TypeScript errors.

3. Patch hygiene:

   `git diff --check`

   Result: PASS.

## Conditions before release closure

- CI must pass on the repair commit.
- Deploy only through the separately approved release gate.
- Production smoke must verify an 800 / 10 / 10 collection displays collected
  800 and remaining 780 before any grading output.
- Business owner must accept the result before the bug is marked resolved.

No database writes, migrations, deploys, pushes, task-board updates, or frontend
changes were performed.

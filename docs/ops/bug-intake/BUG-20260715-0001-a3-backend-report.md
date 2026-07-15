# BUG-20260715-0001 A3 Backend Report

## Source

- Bug: BUG-20260715-0001
- Task: BUGTASK-20260715-0001
- Agent: A3-Backend-Critical-Path
- Route: `/breeding`
- Issue: 运营工作台的当前总存栏与养殖场总览的存栏总数不一致。

## Diagnosis

- Backend authority for breeding overview population is `brd_flocks.current_qty`.
- `/api/v3/farm/daily-hen-report` totals `current_qty` from active laying flocks.
- `/api/v3/farm/trend` also returns `summary.total_qty` from `brd_flocks.current_qty`.
- `/api/dashboard/kpi` already calculated the same flock population as `layingTotal`, but returned `data.stats.stock` from `inv_batches.status='AVAILABLE' SUM(qty_available)`.
- That `inv_batches` value is egg inventory balance, not flock population, so any UI using `stats.stock` for "当前总存栏" displayed the wrong business metric.

## Root Cause

The dashboard BFF mixed two different stock concepts under one `stock` field:

- Correct flock population: `brd_flocks.current_qty`, unit `羽`.
- Egg inventory balance: `inv_batches.qty_available`, unit `枚`.

Breeding overview used the flock source while operation dashboard `stats.stock` used egg inventory.

## Changed Files

- `apps/api/src/modules/bff/bff.controller.ts`
  - Changed `/api/dashboard/kpi` `data.stats.stock` to return `layingTotal` with unit `羽`.
  - Kept egg inventory evidence in `data.meta.stockAvailableTotal` / `stockAvailableBatchCount`.
  - Updated metric source metadata and added `eggInventoryMetricSource`.
- `apps/api/src/modules/bff/bff.controller.spec.ts`
  - Added regression coverage proving `stats.stock` follows `brd_flocks.current_qty`, not `inv_batches.qty_available`.

## Validation

- Focused regression:
  - `cd apps/api && pnpm test -- bff.controller.spec.ts`
  - Result: PASS, 1 suite / 3 tests.
- API typecheck:
  - `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - Result: PASS, 0 errors.

## Guardrails

- No frontend files changed.
- No migrations, schema, entity, table, or column changes.
- No database writes.
- No deployment.
- No push.

## Result

PASS WITH CONDITIONS.

Backend metric source is now aligned for the relevant BFF response, but final resolution still requires CI/CD, production smoke, and business acceptance on `/breeding`.

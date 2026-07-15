# BUG-20260715-0001 A3 Backend Critical Path Report

## Source

- Source bug: `BUG-20260715-0001`
- Source repair task: `BUGTASK-20260715-0001`
- Route: `/breeding`
- Issue: 运营工作台的当前总存栏与养殖场总览的存栏总数不一致

## Diagnosis

Static backend diagnosis found a KPI aggregation drift:

- 运营工作台 BFF route `GET /api/dashboard/kpi` computed current flock population from `brd_flocks.current_qty` with `status='LAYING'` only.
- 养殖场总览 / 趋势 routes in `FarmService` compute the same flock population from `brd_flocks.current_qty` with `status IN ('LAYING','ACTIVE','laying','active')`.

The farm overview/trend definition is the broader active-production source already used by the breeding module, so the BFF KPI was the undercounting side whenever active flocks were stored as `ACTIVE`, `active`, or `laying`.

The bug intake payload did not include synced local attachment files; diagnosis used local source evidence only.

## Changed Files

- `apps/api/src/modules/bff/bff.controller.ts`
  - Aligned `GET /api/dashboard/kpi` flock population SQL with the breeding overview/trend active flock status scope.
- `apps/api/src/modules/bff/bff.controller.spec.ts`
  - Added focused regression coverage for group and restricted-farm KPI population queries.
- `docs/ops/bug-20260715-0001-a3-backend-critical-path.md`
  - This task report.

## Validation

- `cd apps/api && pnpm test -- bff.controller.spec.ts --runInBand`
  - PASS: 1 suite, 2 tests.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit`
  - PASS: 0 errors.

## Guardrails

- No frontend files modified.
- No migrations, schema, entity, table, or column changes.
- No database writes.
- No migration execution.
- No deploy, merge, push, or force operation.

## Decision

PASS WITH CONDITIONS.

Local backend diff and regression validation are complete. Do not claim production resolution until CI/CD passes, production smoke confirms the two displayed totals match, and business acceptance confirms the chosen active flock status scope.

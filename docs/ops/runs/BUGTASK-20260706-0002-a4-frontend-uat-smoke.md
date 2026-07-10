# BUGTASK-20260706-0002 — A4 Frontend UAT Smoke

## Result

HOLD

Do not claim production resolution yet. CI/CD, production smoke, and business acceptance are still required.

## Source

- Bug: `BUG-20260706-0002`
- Task: `BUGTASK-20260706-0002`
- Route: `/home`
- Issue: 运营工作台不显示今日饲料消耗、今日用水
- Agent: `A4-Frontend-UAT-Smoke`

## Diagnosis

`/home` already rendered the feed and water KPI cards behind `MENU_FARM_DATA`, but its aggregation logic treated hen-report totals as the authoritative source once daily logs existed. The hen-report frontend shape used elsewhere contains `totals.feed` but does not define a water total, so `/home` could skip the raw daily-log `water_consumed` fallback and render missing/incorrect water. The previous fallback also treated valid zero values from daily logs as missing.

No backend files, migrations, schema, entity, table, column, deploy, push, or database write were touched.

## Changed Files

- `apps/web/src/app/(admin)/home/page.tsx`
  - Replaced inline KPI aggregation with `buildHomeFarmKpi(...)`.
  - Preserved existing RBAC/DataScope behavior: requests are still gated by `MENU_FARM_DATA`; IoT request remains gated by `MENU_DEVICE_MONITOR`; all requests remain `silent: true`.
- `apps/web/src/lib/home-farm-kpi.ts`
  - Added frontend-only KPI normalizer.
  - Feed priority: hen-report totals → daily logs → IoT summary.
  - Water priority: hen-report totals when present → daily logs → IoT summary converted from tons to liters.
  - Keeps known zero values as `0` instead of converting them to missing.
- `apps/web/src/lib/home-farm-kpi.test.ts`
  - Added focused regression coverage for omitted water totals, known zero daily-log values, and IoT fallback conversion.

## Validation

Commands attempted:

- `git diff --check`
  - PASS
- `node --experimental-strip-types --input-type=module <inline regression script>`
  - PASS
  - Cases covered: hen-report feed plus daily-log water; known zero daily-log values; IoT fallback water tons-to-liters conversion.
- `cd apps/web && pnpm vitest run src/lib/home-farm-kpi.test.ts`
  - BLOCKED: `ERR_PNPM_NO_OFFLINE_TARBALL`; this worktree has no usable `node_modules`.
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`
  - BLOCKED: `./node_modules/.bin/tsc` is absent.
- `pnpm install --offline --frozen-lockfile`
  - BLOCKED: missing cached tarball `concurrently-8.2.2.tgz`.
- `pnpm install --offline --frozen-lockfile --filter web`
  - BLOCKED: missing cached tarball `@radix-ui/primitive-1.1.3.tgz`.

Desktop/mobile `/home` browser smoke was not run because the local web app cannot start without dependencies.

## Required Follow-Up

Run after dependency sync or in CI:

```bash
cd apps/web && pnpm vitest run src/lib/home-farm-kpi.test.ts
cd apps/web && ./node_modules/.bin/tsc --noEmit
cd apps/web && pnpm dev
```

Then smoke `/home` at desktop and mobile widths with an admin or farm-data user and verify:

- `今日饲料消耗` shows daily feed when hen-report totals or daily logs contain it.
- `今日用水` shows daily water from daily logs when hen-report totals omit water.
- Users without `MENU_FARM_DATA:V` still do not see farm KPI cards.
- Users without `MENU_DEVICE_MONITOR:V` still do not call the IoT summary endpoint.

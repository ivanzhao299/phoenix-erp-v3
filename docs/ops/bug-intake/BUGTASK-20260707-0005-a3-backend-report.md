# BUGTASK-20260707-0005 A3 Backend Report

## Source

- Bug: `BUG-20260707-0005`
- Task: `BUGTASK-20260707-0005`
- Route: `/breeding/daily`
- Agent: `A3-Backend-Critical-Path`
- Report time: `2026-07-10`

## Diagnosis

`/breeding/daily` submits to backend route `POST /api/v3/farm/daily-logs`, implemented by `FarmService.submitBreedingDailyLog`.

Root cause: the service only used `body.house_code` conditionally for stock derivation and non-global DataScope ownership checks. It did not require `house_code` before building the white-listed insert. If the request contained other valid fields such as `log_date` and `shift`, the insert path could continue even when the chicken house selector was still empty or displaying the loading placeholder.

## Changed Files

- `apps/api/src/modules/farm/farm.service.ts`
  - Added a pre-transaction required check for `house_code`.
  - Rejects null, missing, non-string, blank, and `加载中...` / `加载中…` placeholder values with `BadRequestException('请先选择鸡舍后再提交')`.
  - Trims selected house codes before downstream derivation, DataScope checks, and insert.
- `apps/api/src/modules/farm/farm.service.spec.ts`
  - Added focused regression coverage for missing/placeholder `house_code` before SQL.
  - Added selected-house happy path coverage verifying trim and insert behavior.

## Validation

Attempted:

```bash
cd apps/api && pnpm test -- farm.service.spec.ts
```

Result: not executed because local package links are absent:

```text
sh: jest: command not found
WARN Local package.json exists, but node_modules missing
```

Attempted:

```bash
cd apps/api && ./node_modules/.bin/tsc --noEmit
```

Result: not executed because `apps/api/node_modules` is absent:

```text
zsh:1: no such file or directory: ./node_modules/.bin/tsc
```

Attempted non-network dependency relink:

```bash
pnpm install --offline
pnpm --filter phoenix-erp-v3-nest install --offline
```

Result: blocked by incomplete local pnpm store; no network install was performed:

```text
ERR_PNPM_NO_OFFLINE_TARBALL concurrently-8.2.2.tgz
ERR_PNPM_NO_OFFLINE_TARBALL @nestjs/common-10.4.22.tgz
```

Static verification completed:

- Reviewed diff is limited to `apps/api/**` and this task report under `docs/ops/**`.
- No web, migration, schema, entity, table, or column changes.
- New guard runs before `entityManager.query` and `entityManager.transaction`, so rejected missing-house submissions do not write SQL.

## Result

`PASS WITH CONDITIONS`

Backend fix and focused regression test are implemented, but local Jest and API typecheck could not run in this worktree because dependencies are not linked and the offline pnpm store is incomplete. Do not claim business resolution until CI/CD, production smoke, and business acceptance confirm the behavior.

# A1 CI Runtime Gate Report

Request ID: `REQ-NL-20260622-210508-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS`

Agent: `A1-CI-Runtime-Gate`

Worktree: `/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate`

Branch: `w5-a1-ci-runtime-gate`

Generated: `2026-06-22 21:13:52 CST`

## Verdict

PASS WITH CONDITIONS

## Scope Compliance

- No merge performed.
- No push performed.
- No deploy performed.
- No migrations executed.
- No database reads/writes were performed.
- No business logic code modified.
- No schema/entity/table/column files modified.
- Only this report file was added under `docs/ops/`.

## Guardrail Checks

| Command | Result | Evidence |
|---|---:|---|
| `pwd` | PASS | `/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate` |
| `git branch --show-current` | PASS | `w5-a1-ci-runtime-gate` |
| `git status --short` | PASS | clean output before report generation |
| `git log --oneline --decorate -8` | PASS | HEAD `90023533 (HEAD -> w5-a1-ci-runtime-gate) docs(ops): add A1 store payment wiring CI report` |

## Dependency Evidence

| Command | Result | Evidence |
|---|---:|---|
| `node --version` | PASS | `v24.14.1` |
| `pnpm --version` | PASS | `9.12.0` |
| `find node_modules apps/api/node_modules apps/web/node_modules -maxdepth 0 -type d -print` | PASS | root, API, and web `node_modules` directories present |
| `rg --files -g 'package.json' -g 'pnpm-lock.yaml' -g 'scripts/*' -g 'docs/ops/*STORE-PAYMENT*'` | PASS | root, API, and web package files present; Store Payment ops reports present |

## CI / Runtime Validation Commands

| Command | Result | Logs Summary |
|---|---:|---|
| `cd apps/api && ./node_modules/.bin/tsc --noEmit` | PASS | exit code 0; no TypeScript errors |
| `cd apps/web && ./node_modules/.bin/tsc --noEmit` | PASS | exit code 0; no TypeScript errors |
| `pnpm --filter phoenix-erp-v3-nest build` | PASS | Nest API build completed with exit code 0 |
| `pnpm --filter web build` with 240s bound | PASS WITH CONDITIONS | Next.js entered `Creating an optimized production build ...`; no terminal PASS/FAIL line before harness termination |

## Web Build Condition Details

Observed warnings before the web build became silent:

- `Both outputFileTracingRoot and turbopack.root are set, but they must have the same value.`
- `Custom Cache-Control headers detected for /_next/static/(.*).`
- `The "middleware" file convention is deprecated. Please use "proxy" instead.`

This matches the prior A1 wiring report condition. No DB action or deployment was attempted to investigate.

## Store Payment Runtime Wiring Evidence

| Check | Result | Evidence |
|---|---:|---|
| AppModule registration | PASS | `apps/api/src/app.module.ts` imports `StorePaymentModule` and includes it in `imports` |
| Module repository registration | PASS | `apps/api/src/modules/store-payment/store-payment.module.ts` registers `StorePaymentAccountEntity`, `StorePaymentRecordEntity`, and `SysOperationLogEntity` |
| Route guard surface | PASS | `apps/api/src/modules/store-payment/store-payment.controller.ts` uses `MenuGuard` and `DataScopeGuard` at controller level |
| Route permissions | PASS | account, record, confirm, reject, and void routes use `@RequireMenu(...)` |
| Service audit references | PASS | static search found service-level `MENU_STORE_PAYMENT*` operation log module codes |

## Read-Only Data Readiness Evidence

| Check | Result | Evidence |
|---|---:|---|
| Store Payment schema migration file exists | PASS | `apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts` creates `store_payment_accounts` and `store_payment_records` |
| Migration was not executed by this agent | PASS | contract forbids migration execution; no migration command was run |
| Target DB table presence | PASS WITH CONDITIONS | not verified because DB access and migration execution were out of scope for this A1 contract |
| A2 security follow-up condition | PASS WITH CONDITIONS | A2 report states runtime use is blocked if S1 tables are absent from target DB |
| A5 single-store gray data checklist | PASS WITH CONDITIONS | A5 report marks pilot store, company, users, collection account, QR code, menu/query permission, and attachment ACL items as pending/partial/gap |

## Blockers / Conditions

1. Web production build did not produce a final terminal status in this local bounded run.
2. Store Payment runtime DB readiness is not cleared by this A1 run because confirming target tables or running migrations is forbidden.
3. A5 readiness remains incomplete: pilot store, company, users/roles, collection account, QR code, menu permissions, and attachment ACL still require explicit confirmation or approved data preparation.
4. A2 follow-up explicitly blocks runtime use in environments where Store Payment S1 tables are absent.

## Final Recommendation

Do not enable Store Payment pilot runtime access yet. Treat API compile/build and static wiring validation as passed, but require a terminal web build result from CI plus an approved A5/DB-readiness confirmation path that does not bypass the no-migration/no-write guardrail. After those are cleared, run a scoped smoke test in an approved environment with Store Payment tables, menu grants, store scope, and attachment behavior already prepared.

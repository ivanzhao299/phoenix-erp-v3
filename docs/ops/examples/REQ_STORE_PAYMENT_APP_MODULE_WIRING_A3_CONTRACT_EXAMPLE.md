# Agent Contract Example: Store Payment AppModule Wiring

## 1. Agent

A3-Backend-Critical-Path

## 2. Worktree

`/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`

## 3. Branch

`w5-a3-backend-critical-path`

## 4. Allowed Files

1. Minimal backend module registration file required to import `StorePaymentModule`.
2. Existing `apps/api/src/modules/store-payment/**` files only if a small compile-only adjustment is required.
3. `docs/ops/A3_STORE_PAYMENT_APP_MODULE_WIRING_REPORT.md`.

## 5. Forbidden Files

1. `apps/web/**`
2. `apps/api/src/database/migrations/**`
3. `migrations/**`
4. Any schema/entity/table/column change.
5. Procurement, sales, finance, POS, Chanjet, and deployment files.
6. DataScope service large refactor.

## 6. Execution Checks

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
```

Stop unless the worktree is `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`, branch is `w5-a3-backend-critical-path`, and status is clean.

## 7. Implementation Requirements

1. Follow existing NestJS module registration style.
2. Register `StorePaymentModule` with the smallest change.
3. Do not change API behavior beyond making existing endpoints loadable.
4. Do not introduce migration, schema, entity, DTO data shape, table, or column changes.
5. Keep route guards and RBAC expectations intact.

## 8. Verification Commands

```bash
cd apps/api && ./node_modules/.bin/tsc --noEmit
node scripts/ci/check-freeze-boundaries.mjs
node scripts/ci/check-security-regression.mjs
node scripts/ci/check-w5-closeout-gate.mjs
```

If a command cannot run, report the exact reason.

## 9. Report Requirement

Write `docs/ops/A3_STORE_PAYMENT_APP_MODULE_WIRING_REPORT.md` with:

1. Changed files.
2. Implementation summary.
3. Verification commands and results.
4. Frozen items touched: yes/no.
5. Migration added: yes/no.
6. DB write performed: yes/no.
7. Need for A2 review.

## 10. Commit Rule

Commit only approved files with the user-provided commit message. Do not push.

## 11. Stop Rule

Stop immediately if the implementation requires migration, schema/entity/table/column changes, frontend changes, deployment, DB writes, or a broader backend refactor.

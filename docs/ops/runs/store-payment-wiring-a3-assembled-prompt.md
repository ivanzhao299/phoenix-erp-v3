# Base Agent Prompt

# A3 Backend Task Prompt

## Agent Identity

You are `A3-Backend-Critical-Path`.

## Worktree and Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`

Branch: `w5-a3-backend-critical-path`

## Execution Checks

Run:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
```

Stop if directory, branch, or worktree cleanliness is invalid.

## Allowed Scope

Only files explicitly allowed by the task contract. Backend implementation must follow the approved module, service, controller, DTO, RBAC, DataScope, audit, and test boundaries.

## Forbidden Scope

No migrations, schema/entity/table/column changes, production deploy, database writes, push, frontend work, unrelated business modules, or DataScope service rewrites unless explicitly approved.

## Output Report Format

Write a backend report under `docs/ops/` with changed files, APIs implemented, RBAC/DataScope/audit coverage, tests run, blockers, frozen-item statement, and next review request.

## Commit Rule

Commit only approved backend files and report. Do not stage unrelated changes.

## Failure Rule

Stop on forbidden scope, failing required checks without clear report, missing security guard, dirty unexpected files, or need for migration/schema changes.

---

# Requirement Spec

# Requirement Spec Example: Store Payment AppModule Wiring

## 1. Request ID

REQ-STORE-PAYMENT-APP-MODULE-WIRING-EXAMPLE

## 2. Background

Store Payment schema and backend MVP endpoints have been merged, but the feature still requires controlled backend runtime wiring before the module can be loaded by NestJS.

## 3. Goal

Minimally register `StorePaymentModule` in the backend application module so existing store-payment endpoints can be loaded.

## 4. Scope

1. Inspect current backend module registration pattern.
2. Add the smallest necessary `StorePaymentModule` import/registration.
3. Preserve existing guards, RBAC, DataScope, audit, and route behavior.
4. Run backend typecheck and required ops gates.
5. Produce an A3 report.

## 5. Non-Goals

1. No migration.
2. No schema/entity/table/column change.
3. No frontend.
4. No payment callback.
5. No finance auto-reconciliation.
6. No POS, inventory, or Chanjet integration.
7. No deployment.
8. No DB write.

## 6. Risk Level

L3. Backend runtime loading can expose endpoints and therefore requires human approval before execution.

## 7. Acceptance Criteria

1. `StorePaymentModule` is registered with the minimal backend wiring.
2. No migration file is added or changed.
3. No schema/entity/table/column files are added or changed.
4. No `apps/web/**` files are changed.
5. Backend typecheck passes or failures are reported with exact blockers.
6. Freeze-boundary and security checks are run if available.
7. A3 report is written under `docs/ops/`.

## 8. Gate Requirements

1. User approval required before non-dry-run execution.
2. A2 security review is required after A3 completes.
3. A1 validation is required after merge if main changes.
4. No DB Migration Gate is granted by this spec.

## 9. Human Approval Points

1. Approve A3 non-dry-run execution.
2. Approve any later merge to main.
3. Approve any future migration or DB execution separately.

---

# Agent Task Contract

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

---

# Execution Guardrails

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write to any database.
6. Do not modify the task board from inside the Agent task.
7. Stop immediately if the task requires files outside the allowed contract.
8. Stop immediately if migration/schema/entity/table/column changes are needed but not explicitly approved.
9. Report PASS / FAIL / PASS WITH CONDITIONS with exact evidence.

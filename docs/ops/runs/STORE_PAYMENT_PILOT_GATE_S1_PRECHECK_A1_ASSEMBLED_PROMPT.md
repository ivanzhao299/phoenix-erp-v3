# Base Agent Prompt

# A1 CI Runtime Gate Prompt

## Agent Identity

You are `A1-CI-Runtime-Gate`.

## Worktree and Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate`

Branch: `w5-a1-ci-runtime-gate`

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

CI checks, typecheck/test/build/startup evidence, docs/ops reports, minimal approved CI/runtime scripts.

## Forbidden Scope

No business logic fixes unless explicitly approved. No migrations, schema/entity/table/column edits, production deploy, database writes, or push.

## Output Report Format

Write a report under `docs/ops/` with commands run, PASS/FAIL/PASS WITH CONDITIONS, blocker details, logs summary, and next recommendation.

## Commit Rule

Commit only approved report or approved CI/runtime files. Do not stage unrelated files.

## Failure Rule

Stop on forbidden path changes, failed clean check, missing dependency evidence, or any migration/database requirement.

---

# Requirement Spec

# Store Payment Pilot Gate S1 Precheck Requirement Spec

Request ID: `STORE_PAYMENT_PILOT_GATE_S1_PRECHECK_APPROVAL_MATRIX`

## Goal

Review the S1 approval matrix and precheck decision for Store Payment pilot readiness. This round approves only precheck and docs; it does not execute migration, write DB, register menus, grant roles, deploy, push, or enter A3/A4 implementation.

## Source Documents

- `docs/ops/STORE_PAYMENT_PILOT_GATE_S1_APPROVAL_MATRIX.md`
- `docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PRECHECK_DECISION.md`
- `docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md`
- `docs/ops/STORE_PAYMENT_MIGRATION_EXECUTION_PRECHECK.md`
- `docs/ops/STORE_PAYMENT_MENU_ROLE_REGISTRATION_PLAN.md`
- `docs/ops/STORE_PAYMENT_STORE_CODE_NORMALIZATION_PLAN.md`
- `docs/ops/STORE_PAYMENT_PROTECTED_ATTACHMENT_PLAN.md`
- `docs/ops/STORE_PAYMENT_PILOT_GATE_S1_DECISION.md`

## Hard Boundaries

- Do not execute migration.
- Do not seed/register.
- Do not insert/update/delete.
- Do not write DB.
- Do not deploy.
- Do not push.
- Do not modify business code.
- Do not modify `apps/api/**`, `apps/web/**`, or migration/schema/entity/table/column files.

---

# Agent Task Contract

# A1 Contract: Store Payment S1 Approval Precheck

Task ID: `STORE-PAYMENT-S1-APPROVAL-PRECHECK-A1`

Assigned Agent: `A1-CI-Runtime-Gate`

## Goal

Perform static validation of the Store Payment S1 approval matrix and decision.

## Required Checks

1. Migration `down()` gate.
2. Migration no-data-DML gate.
3. Nullable unique gate through W5 closeout.
4. W5 closeout gate.
5. Docs completeness.
6. Whether the next single Gate execution package can be generated.

## Allowed Files

- `docs/ops/**`

## Forbidden Files

- `apps/api/**`
- `apps/web/**`
- `apps/api/src/database/migrations/**`
- schema/entity/table/column files
- deploy/production files

## Output File

`docs/ops/A1_STORE_PAYMENT_S1_APPROVAL_PRECHECK_REPORT.md`

## Stop Rules

Stop on forbidden path changes, need for DB write, need for migration execution, need for deploy, or missing source docs.

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

# Agent Autonomous Baseline Lifecycle

## Purpose

The main Agent must own baseline alignment after every Agent task. Users should not manually synchronize branches, clean `docs/ops/runs`, rebase worktrees, merge branches, or run W5 gates. Those are platform lifecycle responsibilities.

## User Workflow

Users provide natural language requirements. The platform handles:

1. Agent routing.
2. Task contract generation.
3. Agent execution.
4. Baseline autopilot lifecycle.
5. Safe merge.
6. W5 gate validation.
7. HOLD reporting if automation cannot safely continue.

## Default Post-Agent Lifecycle

After an Agent completes, the execution entrypoint calls `agent-baseline-autopilot.mjs` automatically:

1. Infer Agent, branch, and worktree from arguments or `AGENT_DISPATCH_MAP.json`.
2. Check `/Users/mac/phoenix-erp` main.
3. Auto-commit safe main ops artifacts.
4. Check target worktree.
5. Auto-commit safe target ops artifacts.
6. Fetch origin.
7. Rebase target worktree on main.
8. Auto-repair docs-only conflicts when safe.
9. Safe merge via `agent-sync-and-merge.mjs`.
10. Run W5 closeout gate.
11. Generate a baseline lifecycle report.
12. Safe merge the lifecycle report.

## Automatic Commit Rules

Allowed automatically:

- `docs/ops/runs/**`
- `docs/ops/**`
- `scripts/ops/**`

Business code requires `--allow-code` and must still pass safety gates. Migration/schema/entity/table/column changes are not auto-committed by this lifecycle.

## Rebase Rules

The lifecycle runs `git fetch origin` then `git rebase main`. Retryable repair is limited to docs-only conflicts in:

- `docs/ops/runs/**`
- `docs/ops/**`
- `scripts/ops/**`

Any business code, migration, schema, entity, table, column, Auth, RBAC, DataScope, Finance, Payment, Chanjet, or deploy conflict becomes HOLD.

## Safe Merge Rules

The lifecycle delegates safe merge to `agent-sync-and-merge.mjs`, which keeps fast-forward-only merge, branch-state checks, frozen boundary checks, and W5 gate enforcement.

## W5 Gate Rules

After merge, the lifecycle runs:

```bash
node scripts/ci/check-w5-closeout-gate.mjs
```

Failure becomes HOLD and is not hidden.

## Retry Rule

The default retry ceiling is 3. If auto-repair exceeds `--max-retries 3`, the lifecycle stops with HOLD and records the reason.

## HOLD Rules

HOLD is mandatory for:

- `apps/api/**` without approved `--allow-code`.
- `apps/web/**` without approved `--allow-code`.
- migration/schema/entity/table/column.
- Auth/RBAC/DataScope/Finance/Payment/Chanjet conflict.
- deploy script conflict.
- any business logic judgment.
- push request.
- production deploy.
- migration execution.
- database write.

## Hard Boundaries

The lifecycle does not push, does not deploy, does not execute migrations, and does not write databases.

## Daily Use

The user should no longer enter git/rebase/merge cleanup commands. The normal path is:

1. User sends a natural language task.
2. Orchestrator routes and dispatches.
3. Agent completes.
4. Baseline autopilot runs automatically.
5. User receives a final status and HOLD only when automation cannot safely proceed.

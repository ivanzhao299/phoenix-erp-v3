# Parallel Agent Execution Policy

## 1. Why Parallelize

Parallel planning reduces idle time for independent read-only gates. CI validation, security review, data readiness, and final QA can often be prepared in parallel when they do not write overlapping files.

## 2. Agents That Can Run in Parallel

Generally safe for dry-run or read-only parallel groups:

1. A1-CI-Runtime-Gate
2. A2-Security-Regression-Gate
3. A5-Data-Readiness
4. A7-Final-QA-Gate
5. Codex-Orchestrator docs-only work

## 3. Tasks Forbidden From Parallel Execution

1. Migration/schema/entity/table/column work.
2. Deployment or production rollback.
3. Database writes.
4. Multiple code-writing tasks touching the same module.
5. Backend and frontend implementation when API contract is not stable.

## 4. File Path Conflict Rules

Two Agents cannot be parallelized for real execution when their allowed scopes overlap in writable paths. Dry-run prompt assembly may still be parallel because it does not change Agent worktrees.

## 5. Migration / Schema / Entity Rule

Any natural language request mentioning migration, schema, entity, table, column, or DB write is HOLD by default. It must not be parallelized.

## 6. Deploy Rule

Deployment, production, rollback, and server operations are HOLD by default. A6 can prepare runbooks, but it cannot deploy.

## 7. parallel Settings

| Setting | Recommendation |
| --- | --- |
| `--parallel 1` | Default and safest. |
| `--parallel 2` | Good for A1 + A2 or A2 + A5 read-only plans. |
| `--parallel 3` | Only for read-only gates with no path overlap. |

## 8. Failure Stops

If any worktree is missing, on the wrong branch, dirty, or behind main in dry-run mode, the plan records HOLD or a rebase requirement. Real execution must stop on any failed Agent.

## 9. Human Approval Boundary

Parallel dry-run planning does not approve execution. Real Agent execution still requires user approval and `APPROVE_AGENT_EXECUTION`. Merge, push, migration, DB write, and deploy remain separate gates.

# Agent Autonomous Baseline Lifecycle Review

## Goal

Upgrade baseline autopilot from a manually invoked helper to the default lifecycle hook after Agent execution.

## Modified Files

| File | Change |
| --- | --- |
| `scripts/ops/agent-baseline-autopilot.mjs` | Added inference, lifecycle report generation, report commit/merge, and stronger lifecycle summary. |
| `scripts/ops/agent-orchestrator.mjs` | Emits explicit lifecycle guarantees in closed-loop and execute-approved plans. |
| `scripts/ops/agent-worker.mjs` | Runs baseline autopilot after real worker execution and marks `COMPLETED_MERGED` or `HOLD`. |
| `scripts/ops/run-agent-task.mjs` | Runs baseline autopilot after direct real Agent execution unless the caller explicitly owns the lifecycle. |
| `scripts/ops/execute-approved-follow-up.mjs` | Runs baseline autopilot after approved follow-up execution and records lifecycle result in summary. |
| `scripts/ops/agent-auto-merge.mjs` | Uses baseline autopilot as merge lifecycle entrypoint. |
| `docs/ops/AGENT_AUTONOMOUS_BASELINE_LIFECYCLE.md` | Operator policy. |
| `docs/ops/AGENT_TASK_BOARD.md` | Records this task. |

## Connected Entrypoints

1. `agent-orchestrator.mjs`
2. `agent-worker.mjs`
3. `run-agent-task.mjs`
4. `execute-approved-follow-up.mjs`
5. `agent-auto-merge.mjs`

## Automatic Commit Test

Dry-run generated `docs/ops/runs/**` and task queue artifacts. The controlled `--yes` test auto-committed the baseline lifecycle report under `docs/ops/runs/**`.

## Automatic Rebase Test

Result: `agent-baseline-autopilot.mjs --yes` fetched origin and rebased `w5-codex-orchestrator` on main successfully.

## Automatic Safe Merge Test

Result: autopilot delegated to `agent-sync-and-merge.mjs`, which delegated to `merge-agent-to-main.mjs`. Both merges were fast-forward safe merges:

1. Functional lifecycle commit merged into main.
2. Generated lifecycle report commit merged into main.

## W5 Gate Test

Result: W5 closeout gate ran and passed.

## Closed-loop Dry-run Result

Command:

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "生成一份 Store Payment readiness 状态报告，只改 docs/ops，不改业务代码，不执行 migration，不部署" \
  --mode closed-loop \
  --parallel 2 \
  --dry-run \
  --output-dir docs/ops/runs
```

Result:

- Selected Agent: `A5-Data-Readiness`.
- Codex CLI executed: No.
- Output included `baseline autopilot will run after agent completion`.
- Output included `user manual rebase required: false`.
- Output included `user manual merge required: false`.
- Output included `user manual docs/ops/runs cleanup required: false`.

## Three Retry Test

Result: controlled `--yes` test completed with `retries: 0`; retry ceiling remains `--max-retries 3`.

## HOLD Test

HOLD remains mandatory for business code without `--allow-code`, migration/schema/entity/table/column, production deploy, DB write, and unsafe conflicts.

## Manual Sync Requirement

User manual branch sync is no longer required for normal Agent lifecycle:

- Manual rebase required: No.
- Manual merge required: No.
- Manual `docs/ops/runs` cleanup required: No.

## Current Limits

1. Business code still requires explicit `--allow-code` and applicable gates.
2. Migration/DB/deploy remain outside autonomous lifecycle.
3. Unsafe conflicts still become HOLD.

## Next Recommendation

Use natural language tasks as the primary interface. Let Orchestrator and workers complete the lifecycle through baseline autopilot unless a HOLD is raised.

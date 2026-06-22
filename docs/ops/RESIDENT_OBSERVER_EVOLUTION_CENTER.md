# Resident Observer / Evolution Center

## Purpose

Resident Observer is a platform-level watcher for Phoenix ERP AI Delivery Factory. It observes routing quality, task queue health, Agent result completeness, baseline status, repeated HOLD patterns, and seven-Agent maturity.

It is not a worker Agent. It does not implement ERP features and does not change business code.

## Inputs

- `docs/ops/runs/**`
- `docs/ops/agent-queue/tasks.json`
- `docs/ops/AGENT_TASK_BOARD.md`
- `docs/ops/AGENT_ROUTER_RULES.json`
- `docs/ops/AGENT_DISPATCH_MAP.json`
- `git status`
- `git log`
- A1-A7 and Codex-Orchestrator worktree status

## Outputs

- `docs/ops/runs/observer-findings-latest.json`
- `docs/ops/runs/observer-findings-latest.md`
- `docs/ops/OBSERVER_FINDINGS_REPORT.md`
- `docs/ops/OBSERVER_EVOLUTION_TASKS.md`

## Finding Shape

Each finding includes:

- `severity`
- `affected_agent`
- `evidence`
- `suggested_fix`
- `auto_fix_eligible`
- `requires_human_gate`
- `recommended_next_task`

## Observation Areas

1. Routing omissions, including A5/A4/A2/A3 keyword hits that are missing from selected Agents.
2. Task queue anomalies, including stale claimed tasks, repeated HOLD, and duplicate task IDs.
3. Agent report defects, including missing `commit_hash`, `verification_results`, `recommend_next_agent`, `migration_executed`, `database_written`, and `deployed`.
4. Baseline issues, including dirty main, uncommitted `docs/ops/runs`, dirty Agent worktrees, and worktrees behind main.
5. Parallel dispatch issues, especially A1/A2/A5 readonly validation not grouped when it should be.
6. Repeated failure patterns from HOLD, routing bugs, and gate failures.
7. Platform maturity across Codex-Orchestrator and A1-A7.

## Boundaries

Resident Observer never:

- Executes Codex CLI.
- Modifies business code.
- Executes migration.
- Writes the database.
- Deploys.
- Pushes.
- Merges.

It may suggest low-risk `docs/ops/**` or `scripts/ops/**` evolution tasks. High-risk issues must remain HOLD until explicitly approved.

## Command

```bash
node scripts/ops/agent-observer.mjs --output-dir docs/ops/runs --dry-run
```

## Evolution Center

Evolution Center is the report and task layer produced by Resident Observer. It turns repeated operational symptoms into proposed platform tasks, while keeping execution behind human Gate where needed.

The first version intentionally generates recommendations only. It does not self-patch the platform.

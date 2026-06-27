# Seven-Agent Parallel Delivery Runbook

## Goal

Use the V2 platform to route, execute, diagnose, and merge Agent work with minimal command copying while preserving human gates for high-risk actions.

## One-Command Planning

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "为当前 ERP 需求生成 seven-agent 并行闭环计划，覆盖 A1/A2/A5/A3/A4/A6/A7，不执行 migration，不部署，不写库" \
  --mode closed-loop \
  --parallel 3 \
  --dry-run \
  --output-dir docs/ops/runs
```

## Queue

```bash
node scripts/ops/agent-task-queue.mjs --list
```

## Read-Only Parallel Workers

```bash
node scripts/ops/agent-worker.mjs --agent A1-CI-Runtime-Gate --claim-next --dry-run
node scripts/ops/agent-worker.mjs --agent A2-Security-Regression-Gate --claim-next --dry-run
node scripts/ops/agent-worker.mjs --agent A5-Data-Readiness --claim-next --dry-run
```

## Diagnosis

```bash
node scripts/ops/agent-diagnose-result.mjs --task-id <task-id> --dry-run
```

## Safe Merge

```bash
cd /Users/mac/phoenix-erp
node scripts/ops/agent-sync-and-merge.mjs <branch> --dry-run
```

Use `--yes` only after reviewing dry-run output.

## Release State

```bash
node scripts/ops/agent-release-state-machine.mjs --request-id <request-id> --to TASKS_CREATED --dry-run
```

## Return To Business Development

Once this platform is frozen, resume ERP feature work by feeding natural language requirements into `agent-orchestrator.mjs --mode closed-loop`, approving only the next required Agent gate.

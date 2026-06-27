# Multi-Agent Parallel Closed-Loop Runbook

## 1. Submit A Natural Language Request

Use `agent-orchestrator.mjs` in `closed-loop` mode:

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "为 Store Payment 生成一份当前状态总览报告，并由 A2 做安全复核、A1 做验证，不改业务代码，不执行 migration，不部署" \
  --mode closed-loop \
  --parallel 3 \
  --dry-run \
  --output-dir docs/ops/runs
```

## 2. Main Agent Task Creation

The orchestrator creates requirement specs, Agent contracts, assembled prompts, and queue tasks under `docs/ops/agent-queue/`.

## 3. Child Agent Claim

Each worker claims only tasks matching its Agent:

```bash
node scripts/ops/agent-worker.mjs --agent A2-Security-Regression-Gate --claim-next --dry-run
node scripts/ops/agent-worker.mjs --agent A1-CI-Runtime-Gate --claim-next --dry-run
```

## 4. Parallel Execution

Read-only and validation Agents can run in parallel. Code-writing Agents stay serialized unless a separate approved plan allows parallel work.

## 5. Diagnosis

After an Agent result is available:

```bash
node scripts/ops/agent-diagnose-result.mjs --task-id <task-id> --dry-run
```

Diagnosis decides whether the task is eligible for auto merge or must enter A1/A2/A4/A6/A7/HOLD.

## 6. Auto Merge

Auto merge is always dry-run first:

```bash
node scripts/ops/agent-auto-merge.mjs --task-id <task-id> --dry-run
```

Formal merge requires approval token and still does not push or deploy.

## 7. HOLD Cases

HOLD is required for migration/schema/entity/table/column changes, DB writes, deploy requests, production GO, high-risk Auth/RBAC/DataScope/Finance/Payment/Chanjet changes, missing result evidence, or failed checks.

## 8. Enter Testing

A1 runs CI/runtime validation. A2 runs security review. A4 runs frontend/UAT only after backend/security gates pass.

## 9. Enter Deployment

A6 prepares staging deploy runbook and rollback plan. It does not deploy production.

## 10. Production GO

A7 summarizes final QA. Production deploy requires explicit human GO.

## 11. Rollback

Rollback is a state-machine decision. Scripts can record `ROLLBACK_REQUIRED`; they do not execute production rollback.

## 12. Short Commands

```bash
node scripts/ops/agent-task-queue.mjs --list
node scripts/ops/agent-worker.mjs --agent A2-Security-Regression-Gate --claim-next --dry-run
node scripts/ops/agent-diagnose-result.mjs --task-id <task-id> --dry-run
node scripts/ops/agent-auto-merge.mjs --task-id <task-id> --dry-run
node scripts/ops/agent-release-state-machine.mjs --show
```

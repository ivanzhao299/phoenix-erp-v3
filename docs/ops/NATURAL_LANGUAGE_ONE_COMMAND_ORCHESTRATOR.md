# Natural Language One-Command Orchestrator

## 1. Phase 6 Goal

Phase 6 adds `scripts/ops/agent-orchestrator.mjs`, a one-command natural language orchestration entrypoint. It generates a request id, minimal Requirement Spec, Agent contracts, assembled prompts, dispatch groups, worktree checks, and next dry-run commands.

## 2. Usage

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "natural language request" \
  --mode supervised \
  --parallel 2 \
  --dry-run \
  --output-dir docs/ops/runs
```

## 3. plan-only Mode

`plan-only` produces specs, contracts, prompts, and plan files. It never executes Agents.

## 4. supervised Mode

`supervised` is the default. It prepares execution plans and flags approval requirements, but dry-run remains the default operating posture.

## 5. execute-approved Mode

`execute-approved` requires:

```bash
--approval-token APPROVE_AGENT_EXECUTION
```

Even then, it does not merge, push, deploy, execute migrations, or write databases.

## 6. parallel N

`--parallel N` controls dry-run dispatch grouping. A1/A2/A5 read-only work can be grouped. Code-writing work is isolated. Migration/schema/deploy requests go HOLD.

## 7. Dry-Run Default

Without explicit approval token, the orchestrator only writes files and commands. It does not call Codex CLI.

## 8. Approval Token Rule

No real Agent execution is allowed without `APPROVE_AGENT_EXECUTION`. The token is never treated as approval for merge, push, migration, DB write, or deploy.

## 9. Forbidden Automation

The orchestrator never automates:

1. Merge.
2. Push.
3. Migration execution.
4. Database write.
5. Deployment.
6. Production rollback.

## 10. Example: Docs-Only

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "整理一份 Store Payment 当前实施状态总览，只生成 docs/ops 报告，不改业务代码，不执行 migration，不部署" \
  --mode supervised \
  --parallel 2 \
  --dry-run \
  --output-dir docs/ops/runs
```

## 11. Example: Backend Wiring

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "把 StorePaymentModule 最小注册到 AppModule，不新增 migration，不改 schema/entity/table/column，不改前端，不部署" \
  --mode supervised \
  --parallel 1 \
  --dry-run \
  --output-dir docs/ops/runs
```

## 12. Example: A2 + A1 Parallel

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "对 StorePaymentModule AppModule wiring 做安全复核和 CI 验证，只允许 A2 只读审查和 A1 验证，不改业务代码，不执行 migration，不部署" \
  --mode supervised \
  --parallel 2 \
  --dry-run \
  --output-dir docs/ops/runs
```

## 13. Next Real Development Hook

The next step is to let Orchestrator review a generated plan, select one safe Agent command, and execute through the existing approval-token guard.

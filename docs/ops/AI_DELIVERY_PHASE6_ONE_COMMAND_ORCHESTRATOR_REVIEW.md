# AI Delivery Phase 6 One-Command Orchestrator Review

## 1. Stage Goal

Phase 6 delivers a real one-command natural language orchestrator. It generates request IDs, specs, contracts, assembled prompts, dry-run dispatch plans, worktree checks, and next-command suggestions.

## 2. Added Files

1. `scripts/ops/agent-orchestrator.mjs`
2. `docs/ops/PARALLEL_AGENT_EXECUTION_POLICY.md`
3. `docs/ops/NATURAL_LANGUAGE_ONE_COMMAND_ORCHESTRATOR.md`
4. `docs/ops/AI_DELIVERY_PHASE6_ONE_COMMAND_ORCHESTRATOR_REVIEW.md`

## 3. Capability List

1. Natural language input from `--request` or `--request-file`.
2. Request id generation.
3. Risk classification.
4. HOLD for migration/schema/entity/table/column/deploy/DB-write requests.
5. Agent selection using `AGENT_DISPATCH_MAP.json`.
6. Requirement Spec generation.
7. Agent Contract generation.
8. Assembled prompt generation.
9. Worktree branch/clean checks.
10. Dry-run dispatch groups with `--parallel N`.
11. No automatic merge, push, migration, DB write, or deployment.

## 4. Natural Language Input Test

Docs-only dry-run command:

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "整理一份 Store Payment 当前实施状态总览，只生成 docs/ops 报告，不改业务代码，不执行 migration，不部署" \
  --mode supervised \
  --parallel 2 \
  --dry-run \
  --output-dir docs/ops/runs
```

Actual result:

```text
Request ID: REQ-NL-20260622-184144-STORE-PAYMENT-DOCS-OPS-MIGRATION
Risk: LOW
Decision: PLAN_READY
Selected agents: Codex-Orchestrator
Dispatch groups: [Codex-Orchestrator]
Codex CLI executed: No
```

## 5. Parallel Plan Test

A2 + A1 dry-run command:

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "对 StorePaymentModule AppModule wiring 做安全复核和 CI 验证，只允许 A2 只读审查和 A1 验证，不改业务代码，不执行 migration，不部署" \
  --mode supervised \
  --parallel 2 \
  --dry-run \
  --output-dir docs/ops/runs
```

Expected: A2 and A1 contracts and assembled prompts are generated, with no Codex CLI execution.

Actual result:

```text
Request ID: REQ-NL-20260622-184223-STORE-PAYMENT-MODULE-APPMODULE-WIRING-CI-A2-A1-M
Risk: LOW/MEDIUM
Decision: PLAN_READY
Selected agents: A2-Security-Regression-Gate, A1-CI-Runtime-Gate
Dispatch groups: [A2-Security-Regression-Gate, A1-CI-Runtime-Gate]
Codex CLI executed: No
```

## 6. HOLD Test

High-risk HOLD command:

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "新增一个数据库 migration 修改 store_payment_records 表结构，并直接部署上线" \
  --mode supervised \
  --parallel 2 \
  --dry-run \
  --output-dir docs/ops/runs
```

Expected: HOLD with migration/schema/deploy reasons.

Actual result:

```text
Request ID: REQ-NL-20260622-184150-MIGRATION-STORE-PAYMENT-RECORDS
Risk: HIGH
Decision: HOLD
Selected agents: A2-Security-Regression-Gate, Codex-Orchestrator
Dispatch groups: None
Codex CLI executed: No
Held reasons: migration/schema/entity/table/column request requires HOLD; deploy/production request requires HOLD
```

## 7. High-Risk Action Evidence

The orchestrator summary records:

1. Codex CLI executed: No
2. Migration executed: No
3. Database written: No
4. Deployment executed: No
5. Merge executed: No
6. Push executed: No

## 8. Current Limits

1. Risk classification is keyword-based.
2. Generated Requirement Specs are minimal.
3. Real Agent execution remains delegated to existing approval-token guarded scripts.
4. Rebase is only executed in non-dry-run execute-approved mode with token.

## 9. Next Recommendation

Use Phase 6 as the default intake path for new natural language requests. For the next iteration, add structured JSON schemas for generated specs and contracts.

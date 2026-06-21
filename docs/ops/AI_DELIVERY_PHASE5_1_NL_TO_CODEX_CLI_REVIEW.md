# AI Delivery Phase 5.1 Natural Language to Codex CLI Review

## 1. Stage Goal

Phase 5.1 connects natural language dispatch output to Codex CLI Agent execution by adding Requirement Spec and Agent Contract prompt assembly to `run-agent-task.mjs`.

This phase only builds orchestration infrastructure. It does not develop Store Payment functionality.

## 2. Added / Modified Files

1. Modified `scripts/ops/run-agent-task.mjs`.
2. Added `docs/ops/NATURAL_LANGUAGE_TO_CODEX_CLI_DISPATCH.md`.
3. Added `docs/ops/examples/NL_REQUEST_STORE_PAYMENT_WIRING_EXAMPLE.md`.
4. Added `docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_SPEC_EXAMPLE.md`.
5. Added `docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_A3_CONTRACT_EXAMPLE.md`.
6. Added `docs/ops/AI_DELIVERY_PHASE5_1_NL_TO_CODEX_CLI_REVIEW.md`.
7. Updated `docs/ops/AGENT_TASK_BOARD.md`.

## 3. run-agent-task New Capability

`run-agent-task.mjs` now supports:

1. `--request-spec <file>`
2. `--task-contract <file>`
3. `--assembled-prompt-output <file>`
4. `--require-approval-token <token>`

The runner validates the Agent, worktree, branch, clean status, prompt file, and optional payload files before any Codex CLI execution.

## 4. Prompt Assembly Rule

The final prompt is assembled in this order:

1. Base Agent Prompt.
2. Requirement Spec.
3. Agent Task Contract.
4. Execution Guardrails.

The assembled prompt can be written to `docs/ops/runs/` for review before execution.

## 5. Approval Token Rule

For non-dry-run execution with a Requirement Spec or Agent Contract, the runner requires:

```bash
--require-approval-token APPROVE_AGENT_EXECUTION
```

Without the correct token, the runner refuses to invoke Codex CLI.

## 6. Dry-Run Test Result

Executed dry-run command:

```bash
node scripts/ops/run-agent-task.mjs \
  --agent A3-Backend-Critical-Path \
  --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path \
  --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md \
  --request-spec docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_SPEC_EXAMPLE.md \
  --task-contract docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_A3_CONTRACT_EXAMPLE.md \
  --assembled-prompt-output docs/ops/runs/store-payment-wiring-a3-assembled-prompt.md \
  --dry-run
```

Result:

```text
Agent: A3-Backend-Critical-Path
Worktree: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
Branch: w5-a3-backend-critical-path
Prompt: docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md
Requirement spec: docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_SPEC_EXAMPLE.md
Task contract: docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_A3_CONTRACT_EXAMPLE.md
Assembled prompt: docs/ops/runs/store-payment-wiring-a3-assembled-prompt.md
Assembled prompt chars: 5970
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --sandbox workspace-write -
Dry run: command not executed.
```

Non-dry-run without approval token was rejected:

```text
ERROR: non-dry-run Agent execution with request spec or task contract requires --require-approval-token APPROVE_AGENT_EXECUTION
```

## 7. Current Limits

1. No automatic task board updates.
2. No automatic merge.
3. No automatic push.
4. No deployment.
5. No migration execution.
6. No DB writes.
7. No automatic approval for code-writing Agents.

## 8. Next Recommendation

Use the Store Payment wiring example for one real Codex CLI dry-run and review the assembled prompt manually. After that, add `--task-contract` support to future Orchestrator-generated task contracts and keep non-dry-run execution behind explicit user approval.

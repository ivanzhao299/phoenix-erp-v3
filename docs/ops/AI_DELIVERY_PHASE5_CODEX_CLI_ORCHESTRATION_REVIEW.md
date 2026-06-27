# AI Delivery Phase 5 Codex CLI Orchestration Review

## 1. Stage Goal

Phase 5 builds the minimum automation layer for routing approved Agent tasks through Codex CLI. It connects the Delivery Factory flow from natural language intake to controlled Agent execution, while preserving human gates for code changes, migrations, database writes, merges, pushes, and deployment.

This phase does not continue Store Payment feature development.

## 2. Added Files

1. `docs/ops/CODEX_CLI_ORCHESTRATION_PLAN.md`
2. `docs/ops/prompts/CODEX_ORCHESTRATOR_SYSTEM_PROMPT.md`
3. `docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md`
4. `docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md`
5. `docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md`
6. `docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md`
7. `docs/ops/prompts/A5_DATA_READINESS_PROMPT.md`
8. `docs/ops/prompts/A6_DEPLOY_RUNBOOK_PROMPT.md`
9. `docs/ops/prompts/A7_FINAL_QA_GATE_PROMPT.md`
10. `scripts/ops/run-agent-task.mjs`
11. `scripts/ops/plan-next-agent.mjs`

## 3. Automation Capability

1. Standard prompt files for Codex-Orchestrator and A1-A7.
2. Worktree, branch, and clean-status validation before Agent execution.
3. Codex CLI dry-run command preview.
4. Non-dry-run Codex CLI invocation through `codex exec -C <worktree> -`.
5. Run log creation under `docs/ops/runs/`.
6. Task board scanning for `ready`, `ready-next`, and `pending-review` statuses.
7. Suggested next Agent output without automatic execution.

## 4. Gates Still Requiring Human Execution

1. Agent launch approval for code-writing tasks.
2. Merge approval.
3. Push approval.
4. Migration creation approval.
5. Migration execution approval.
6. Database write approval.
7. Staging deploy approval.
8. Production deploy or rollback approval.
9. GO / GO WITH CONDITIONS / HOLD / ROLLBACK decision.

## 5. Current Non-Automated Items

1. No automatic merge.
2. No automatic push.
3. No automatic deploy.
4. No migration execution.
5. No database writes.
6. No Store Payment feature development.
7. No automatic task board mutation by `plan-next-agent.mjs`.

## 6. run-agent-task.mjs Test Method

```bash
node --check scripts/ops/run-agent-task.mjs
node scripts/ops/run-agent-task.mjs \
  --agent A1-CI-Runtime-Gate \
  --worktree /Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate \
  --prompt docs/ops/prompts/A1_CI_RUNTIME_GATE_PROMPT.md \
  --dry-run
```

Expected result: the script validates the A1 worktree, branch, clean status, prompt path, and prints the Codex command without executing it.

## 7. plan-next-agent.mjs Test Method

```bash
node --check scripts/ops/plan-next-agent.mjs
node scripts/ops/plan-next-agent.mjs
```

Expected result: the script reads `docs/ops/AGENT_TASK_BOARD.md`, searches for `ready`, `ready-next`, or `pending-review`, and prints the suggested Agent, worktree, and prompt file without executing or editing anything.

## 8. Next Recommendation

Next, connect natural language dispatch output to a generated task contract file and pass that contract into `run-agent-task.mjs` as an appended prompt payload. Keep the default mode as dry-run until the user explicitly approves the Agent launch.

Recommended Phase 6 additions:

1. Add `--task-contract <file>` to `run-agent-task.mjs`.
2. Add request-id based run logs.
3. Add structured JSON summary output for Orchestrator ingestion.
4. Add read-only validation that allowed/forbidden file scopes in the task contract match the Agent prompt.

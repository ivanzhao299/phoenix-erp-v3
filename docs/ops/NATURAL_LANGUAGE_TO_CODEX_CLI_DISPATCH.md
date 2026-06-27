# Natural Language to Codex CLI Dispatch

## 1. Natural Language Entry

User requests enter through the Codex-Orchestrator window as natural language. The Orchestrator must preserve the original wording, classify risk, identify affected modules, and decide whether clarification or human approval is required.

## 2. Requirement Spec Generation

The Orchestrator converts the natural language request into a Requirement Spec with:

1. Request ID.
2. Original natural language.
3. Background and goal.
4. Scope and non-goals.
5. Risk level.
6. Allowed and forbidden work.
7. Acceptance criteria.
8. Gate requirements.
9. Human approval points.

## 3. Agent Contract Generation

For each Agent, the Orchestrator generates an Agent Contract with:

1. Agent identity.
2. Worktree and branch.
3. Allowed files.
4. Forbidden files.
5. Required checks.
6. Implementation or read-only review instructions.
7. Output report path.
8. Commit rule.
9. Stop rule.

## 4. Prompt Assembly

`scripts/ops/run-agent-task.mjs` assembles the final prompt in this order:

1. Base Agent Prompt.
2. Requirement Spec, if `--request-spec` is provided.
3. Agent Task Contract, if `--task-contract` is provided.
4. Execution Guardrails.

The assembled prompt can be written to a reviewable file with `--assembled-prompt-output`.

## 5. Dry-Run Default

Dry-run is the default operating posture. The Orchestrator should first run:

```bash
node scripts/ops/run-agent-task.mjs \
  --agent <Agent> \
  --worktree <worktree> \
  --prompt <prompt-file> \
  --request-spec <spec-file> \
  --task-contract <contract-file> \
  --assembled-prompt-output <assembled-prompt-file> \
  --dry-run
```

Dry-run validates the target worktree, branch, clean status, prompt paths, and assembled prompt output. It does not call Codex CLI.

## 6. User Approval Mechanism

For non-dry-run execution with a Requirement Spec or Agent Contract, the runner requires:

```bash
--require-approval-token APPROVE_AGENT_EXECUTION
```

Without this token, the command stops before invoking Codex CLI.

## 7. Agent Return Path

After an Agent runs, it must:

1. Write the required report under `docs/ops/`.
2. Commit only approved files.
3. State PASS / FAIL / PASS WITH CONDITIONS.
4. List frozen items touched.
5. List verification commands and results.
6. Return control to Codex-Orchestrator for review.

## 8. Agent Routing

| Agent | Dispatch Use |
| --- | --- |
| A1-CI-Runtime-Gate | CI, typecheck, build, startup, post-merge validation. |
| A2-Security-Regression-Gate | RBAC, DataScope, audit, JWT, logs, attachment ACL, security review. |
| A3-Backend-Critical-Path | Backend service/controller/module implementation after approval. |
| A4-Frontend-UAT-Smoke | Frontend pages, UAT smoke, screenshots after backend/security gates. |
| A5-Data-Readiness | Read-only data baseline and master-data readiness. |
| A6-Staging-Deploy-Runbook | Staging runbook and rollback planning. |
| A7-Final-QA-Gate | Final GO / GO WITH CONDITIONS / HOLD / ROLLBACK synthesis. |

## 9. Tasks Allowed for Automation

1. Docs-only Orchestrator tasks.
2. Dry-run prompt assembly.
3. Read-only review tasks after approval.
4. CI/runtime validation after approval.
5. Code-writing Agent execution only after explicit user approval and token.

## 10. Tasks Requiring Manual Approval

1. Any L3+ behavior change.
2. Any Agent execution that writes code.
3. Auth, RBAC, DataScope, finance, master data, third-party integration work.
4. Merge to main.
5. Push to remote.
6. Deployment.

## 11. Hard Boundaries

The dispatch chain must not automate:

1. Migration creation unless separately approved.
2. Migration execution.
3. DB writes.
4. Production deployment.
5. Production rollback.
6. Push.
7. Destructive git operations.

## 12. End-to-End Example

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

After user approval:

```bash
node scripts/ops/run-agent-task.mjs \
  --agent A3-Backend-Critical-Path \
  --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path \
  --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md \
  --request-spec docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_SPEC_EXAMPLE.md \
  --task-contract docs/ops/examples/REQ_STORE_PAYMENT_APP_MODULE_WIRING_A3_CONTRACT_EXAMPLE.md \
  --assembled-prompt-output docs/ops/runs/store-payment-wiring-a3-assembled-prompt.md \
  --require-approval-token APPROVE_AGENT_EXECUTION
```

## 13. Follow-Up Dispatch Plan Dry-Run

After `parse-agent-result.mjs` and `decide-next-agent.mjs` generate a decision plan, the Orchestrator can dry-run every follow-up Agent prompt assembly with:

```bash
node scripts/ops/dispatch-follow-up-plan.mjs \
  --plan docs/ops/runs/a3-app-module-wiring-next-agent-plan.json \
  --output-dir docs/ops/runs \
  --dry-run
```

The follow-up dispatch dry-run calls `run-agent-task.mjs --dry-run` for each follow-up item. It generates assembled prompts and a summary report, but it does not start Codex CLI execution.

Follow-up dispatch defaults to dry-run because follow-up Agents may inspect code, produce reports, or eventually write approved changes. Real execution still requires a separate user approval and an explicit approval token. The dry-run runner must never pass `--require-approval-token`.

Boundary:

1. Follow-up dry-run may assemble prompts.
2. Follow-up dry-run may validate worktree, branch, clean status, prompt file, and task contract file.
3. Follow-up dry-run must not execute Codex CLI.
4. Real Agent execution must be launched separately by the user-approved `run-agent-task.mjs` command.
5. Migration, DB writes, deployment, merge, and push remain outside this automation.

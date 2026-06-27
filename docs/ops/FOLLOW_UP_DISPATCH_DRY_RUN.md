# Follow-Up Dispatch Dry-Run

## 1. Phase 5.4 Goal

Phase 5.4 adds a follow-up dispatch dry-run runner. It reads a decision plan from `decide-next-agent.mjs` and calls `run-agent-task.mjs --dry-run` for each follow-up item to generate assembled prompts.

This phase does not start any Agent and does not develop business functionality.

## 2. Input Decision Plan

Input file:

`docs/ops/runs/a3-app-module-wiring-next-agent-plan.json`

Required plan state:

1. `decision` must be `DISPATCH_PLAN_READY`.
2. `follow_up_dispatches` must be non-empty.
3. Every follow-up item must include task id, Agent, worktree, branch, prompt file, contract file, dry-run command, and `approval_required: true`.

## 3. dispatch-follow-up-plan.mjs Behavior

The script:

1. Reads the decision plan JSON.
2. Rejects HOLD/FAIL/non-ready plans.
3. Validates each follow-up item.
4. Rejects any command containing `--require-approval-token`.
5. Calls `node scripts/ops/run-agent-task.mjs ... --dry-run`.
6. Generates assembled prompts under the output directory.
7. Writes `docs/ops/runs/follow-up-dispatch-dry-run-summary.md`.

## 4. Dry-Run Forced Rule

`dispatch-follow-up-plan.mjs` only supports dry-run. It must not provide a mode for real Codex CLI execution. Real execution is intentionally left to the explicit `run-agent-task.mjs` command after user approval.

## 5. Assembled Prompt Rule

For each follow-up:

1. Base Agent prompt is loaded.
2. Follow-up Agent contract is appended.
3. Execution guardrails are appended by `run-agent-task.mjs`.
4. The assembled prompt is written to `docs/ops/runs/<follow_up_task_id>-assembled-prompt.md`.

## 6. Why Codex CLI Is Not Automatically Executed

Follow-up Agents can review or modify sensitive areas after approval. Automatically executing them from a decision plan would bypass the human gate. The dry-run runner only prepares reviewable prompt artifacts.

## 7. When Real Execution Is Allowed

Real execution is allowed only after the user approves:

1. The follow-up task.
2. The target Agent.
3. The generated contract.
4. The assembled prompt.
5. The allowed file scope.

Then the user may run `run-agent-task.mjs` separately with `--require-approval-token APPROVE_AGENT_EXECUTION`.

## 8. Automation Hard Boundaries

This runner never:

1. Merges.
2. Pushes.
3. Deploys.
4. Executes migrations.
5. Writes databases.
6. Modifies task board.
7. Passes approval token.

## 9. End-to-End Example

```bash
node scripts/ops/dispatch-follow-up-plan.mjs \
  --plan docs/ops/runs/a3-app-module-wiring-next-agent-plan.json \
  --output-dir docs/ops/runs \
  --dry-run
```

Expected result:

1. A2 assembled prompt is generated.
2. A1 assembled prompt is generated.
3. Summary report is written.
4. No Agent is actually started.

# Approved Follow-Up Execution Guard

## 1. Phase 5.5 Goal

Phase 5.5 adds a guard for executing exactly one approved follow-up Agent from a decision plan. It validates the plan, selected follow-up task, approval token, assembled prompt, worktree, branch, and clean status before calling `run-agent-task.mjs`.

This phase adds automation infrastructure only. It does not develop business functionality.

## 2. Why a Separate Approval Token Is Required

Follow-up dispatch plans are generated automatically from Agent result JSON. They are not human approval. A separate token prevents an automatically generated plan from becoming real Agent execution without explicit user intent.

The required token is:

`APPROVE_AGENT_EXECUTION`

The token is checked but never logged.

## 3. Why Only One Follow-Up Task Can Execute

One-at-a-time execution keeps review and rollback boundaries clear. A2 security review, A1 validation, A4 frontend smoke, A6 runbook, and A7 final QA each have different risks and evidence requirements.

## 4. Script Input and Output

Input:

1. `--plan`
2. `--follow-up-task-id`
3. `--approval-token`
4. `--output-dir`

Output:

1. Execution audit under `docs/ops/runs/`.
2. `docs/ops/runs/approved-follow-up-execution-summary.md`.

## 5. Execution Checks

The script checks:

1. Plan exists.
2. Plan decision is `DISPATCH_PLAN_READY`.
3. Follow-up task exists in the plan.
4. Selected item has `approval_required: true`.
5. Token equals `APPROVE_AGENT_EXECUTION`.
6. Contract file exists.
7. Assembled prompt exists.
8. Worktree exists.
9. Worktree is a git repository.
10. Worktree branch matches the plan.
11. Worktree is clean.

## 6. Worktree Clean Check

If `git status --short` in the target worktree is not empty, execution stops. The guard must not run Codex into a dirty Agent worktree.

## 7. Approval Token Check

Without the correct token, execution stops before `run-agent-task.mjs` is called.

## 8. Hard Boundaries

The guard does not allow:

1. Migration execution.
2. Database writes.
3. Deployment.
4. Merge.
5. Push.
6. Destructive git operations.
7. Task board modification.

## 9. Relationship to dispatch-follow-up-plan.mjs

`dispatch-follow-up-plan.mjs` prepares assembled prompts through dry-run only. `execute-approved-follow-up.mjs` refuses to run if the assembled prompt file does not already exist, which forces prompt review before execution.

## 10. Relationship to run-agent-task.mjs

The guard delegates real Codex CLI execution to `run-agent-task.mjs` and passes:

1. Agent.
2. Worktree.
3. Prompt.
4. Task contract.
5. Assembled prompt output.
6. Approval token.

`run-agent-task.mjs` still performs its own worktree, branch, clean, prompt, and token checks.

## 11. End-to-End Example

Review prompts first:

```bash
node scripts/ops/dispatch-follow-up-plan.mjs \
  --plan docs/ops/runs/a3-app-module-wiring-next-agent-plan.json \
  --output-dir docs/ops/runs \
  --dry-run
```

After user approval, execute one follow-up:

```bash
node scripts/ops/execute-approved-follow-up.mjs \
  --plan docs/ops/runs/a3-app-module-wiring-next-agent-plan.json \
  --follow-up-task-id REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP \
  --approval-token APPROVE_AGENT_EXECUTION \
  --output-dir docs/ops/runs
```

## 12. Failure Stop Rules

Stop on:

1. Missing or wrong approval token.
2. Missing assembled prompt.
3. Dirty worktree.
4. Wrong branch.
5. Missing contract.
6. Non-ready decision plan.
7. Any `run-agent-task.mjs` non-zero exit.

# AI Delivery Phase 5.5 Approved Follow-Up Execution Guard Review

## 1. Stage Goal

Phase 5.5 adds an approved follow-up execution guard. It selects exactly one follow-up task from a decision plan and, after explicit approval, delegates execution to `run-agent-task.mjs`.

This phase does not execute real Codex CLI and does not develop business functionality.

## 2. Added / Modified Files

1. Added `scripts/ops/execute-approved-follow-up.mjs`.
2. Added `docs/ops/APPROVED_FOLLOW_UP_EXECUTION_GUARD.md`.
3. Added `docs/ops/AI_DELIVERY_PHASE5_5_APPROVED_FOLLOW_UP_EXECUTION_GUARD_REVIEW.md`.
4. Updated `scripts/ops/run-agent-task.mjs`.
5. Updated `docs/ops/AGENT_TASK_BOARD.md`.

## 3. execute-approved-follow-up.mjs Capability

The guard:

1. Reads a decision plan.
2. Selects one follow-up task.
3. Requires `approval_required: true`.
4. Requires `--approval-token APPROVE_AGENT_EXECUTION`.
5. Checks contract and assembled prompt files.
6. Checks worktree existence, git repo, branch, and clean status.
7. Writes audit and summary files.
8. Calls `run-agent-task.mjs` only after all checks pass.

## 4. run-agent-task.mjs Hardening

`run-agent-task.mjs` now records in its run log:

1. Whether approval token was provided.
2. Whether the run was dry-run.
3. Whether Codex actually executed.

It does not log the token value.

## 5. Test Strategy

Dry-run behavior is covered by Phase 5.4.

No-token test:

```bash
node scripts/ops/execute-approved-follow-up.mjs \
  --plan docs/ops/runs/a3-app-module-wiring-next-agent-plan.json \
  --follow-up-task-id REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP \
  --output-dir docs/ops/runs
```

Wrong-token test:

```bash
node scripts/ops/execute-approved-follow-up.mjs \
  --plan docs/ops/runs/a3-app-module-wiring-next-agent-plan.json \
  --follow-up-task-id REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP \
  --approval-token WRONG_TOKEN \
  --output-dir docs/ops/runs
```

Actual no-token result:

```text
ERROR: approval token is missing or invalid; refusing to execute follow-up Agent
```

Actual wrong-token result:

```text
ERROR: approval token is missing or invalid; refusing to execute follow-up Agent
```

Correct-token command example only, not executed in this phase:

```bash
node scripts/ops/execute-approved-follow-up.mjs \
  --plan docs/ops/runs/a3-app-module-wiring-next-agent-plan.json \
  --follow-up-task-id REQ-STORE-PAYMENT-APP-MODULE-WIRING-001-A2-FOLLOWUP \
  --approval-token APPROVE_AGENT_EXECUTION \
  --output-dir docs/ops/runs
```

## 6. Real Codex CLI Execution

No. This phase does not run the correct token command.

## 7. Approval Token

Only rejection logic is tested. The correct approval token is documented but not used for real execution in this phase.

## 8. Database / Deploy Safety

| Item | Result |
| --- | --- |
| Database write | No |
| Migration execution | No |
| Deployment | No |
| Merge | No |
| Push | No |

## 9. Current Limits

1. The guard only executes one selected follow-up task.
2. It does not update task board.
3. It does not merge, push, deploy, run migrations, or write DB.
4. It relies on the Phase 5.4 assembled prompt existing before execution.

## 10. Next Recommendation

Review the A2 follow-up assembled prompt and contract. If acceptable, the user can explicitly approve running A2 through `execute-approved-follow-up.mjs` with `APPROVE_AGENT_EXECUTION`.

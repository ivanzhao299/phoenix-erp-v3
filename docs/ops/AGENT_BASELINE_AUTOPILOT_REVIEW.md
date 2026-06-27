# Agent Baseline Autopilot Review

## Goal

Add a high-level post-Agent autopilot that automatically commits safe ops artifacts, aligns Agent worktrees to main, runs safe merge preflight, and gates the result with bounded retry behavior.

## Added / Modified Files

| File | Purpose |
| --- | --- |
| `scripts/ops/agent-baseline-autopilot.mjs` | High-level auto commit, rebase, safe merge, and W5 gate entrypoint. |
| `scripts/ops/agent-worker.mjs` | Prints autopilot command after dry-run or real worker execution. |
| `scripts/ops/agent-auto-merge.mjs` | Uses autopilot instead of direct sync/merge command. |
| `scripts/ops/agent-orchestrator.mjs` | Emits autopilot commands for closed-loop and execute-approved follow-up. |
| `docs/ops/AGENT_BASELINE_AUTOPILOT.md` | Operator guide. |
| `docs/ops/AGENT_TASK_BOARD.md` | Records `AGENT-BASELINE-AUTOPILOT`. |

## Automatic Commit Capability

Autopilot can auto-commit:

- `docs/ops/runs/**`
- `docs/ops/**`
- `scripts/ops/**`

It refuses migration/schema/entity/table/column. It refuses business code unless `--allow-code` is passed and downstream safe gates still allow it.

## Automatic Rebase Capability

Autopilot locates the target worktree by branch, verifies it is on the requested branch, then runs `git fetch origin` and `git rebase main` in approved mode. Dry-run reports the planned rebase.

## Automatic Safe Merge Capability

Autopilot delegates merge to `agent-sync-and-merge.mjs`. That keeps branch-state checks, fast-forward enforcement, frozen boundary checks, and post-merge validation in the established lower-level tool.

## Three Retry Capability

The default retry limit is 3. Retryable scope is deliberately narrow:

- Safe ops artifact commit.
- Worktree behind main.
- docs/ops/runs conflict repair.
- Gate retry caused by generated run artifacts.

Any fourth retry or unsafe conflict becomes HOLD.

## Automatic Fix Scope

Allowed:

- Uncommitted `docs/ops/runs/**`.
- Uncommitted `docs/ops/**`.
- Uncommitted `scripts/ops/**`.
- Worktree behind main.
- Fast-forward merge requiring rebase.
- docs-only run artifact conflict.

Forbidden:

- Business code conflict.
- Migration/schema/entity/table/column conflict.
- Deployment conflict.
- Any DB write or migration execution.
- Push or deploy.

## Dry-run Test Result

Dry-run command:

```bash
node scripts/ops/agent-baseline-autopilot.mjs \
  --agent Codex-Orchestrator \
  --branch w5-codex-orchestrator \
  --max-retries 3 \
  --dry-run
```

Result:

- Main worktree had 8 generated `docs/ops/runs/**` files; dry-run reported they would be auto-committed with `docs(ops): record generated ops run artifacts`.
- Target worktree had 7 safe ops files under `docs/ops/**` and `scripts/ops/**`; dry-run reported they would be auto-committed with `docs(ops): record generated ops artifacts`.
- Dry-run reported `git fetch origin`, `git rebase main`, `agent-sync-and-merge.mjs w5-codex-orchestrator --dry-run`, and `node scripts/ci/check-w5-closeout-gate.mjs`.
- Push, deploy, migration execution, and DB write were all reported as `No`.

## Current Limits

1. Autopilot does not resolve business conflicts.
2. Autopilot does not bypass `merge-agent-to-main.mjs` or `agent-sync-and-merge.mjs`.
3. Approved real merge still depends on main being in `/Users/mac/phoenix-erp`.
4. Production deploy and DB migration remain outside this automation.

## Next Recommendation

Make `agent-baseline-autopilot.mjs` the default post-Agent command in all worker reports and merge recommendations. Users should only need to approve the high-level autopilot command, not manually run sync/rebase/merge steps.

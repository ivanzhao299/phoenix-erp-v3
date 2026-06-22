# Agent Baseline Autopilot

## Why This Exists

Agent work should not end with a human copying the same sync, rebase, dirty-check, and safe-merge commands across main and every Agent worktree. Those steps are platform plumbing. `agent-baseline-autopilot.mjs` makes them a standard post-task flow with bounded self-repair.

## Daily Rule

Users should not manually synchronize branches for routine Agent outputs. Use the autopilot entrypoint:

```bash
node scripts/ops/agent-baseline-autopilot.mjs \
  --agent A2-Security-Regression-Gate \
  --branch w5-a2-security-regression-gate \
  --max-retries 3 \
  --dry-run
```

Approved execution:

```bash
node scripts/ops/agent-baseline-autopilot.mjs \
  --agent A2-Security-Regression-Gate \
  --branch w5-a2-security-regression-gate \
  --max-retries 3 \
  --yes
```

## Responsibilities

`agent-baseline-autopilot.mjs` is the high-level entrypoint for:

1. Locating `/Users/mac/phoenix-erp`.
2. Checking main branch and main worktree cleanliness.
3. Auto-committing safe ops artifacts.
4. Locating the target Agent worktree.
5. Checking target branch and target worktree cleanliness.
6. Auto-committing safe Agent outputs.
7. Running `git fetch origin`.
8. Rebasing the Agent worktree on main.
9. Handling docs-only retryable conflicts.
10. Calling `agent-sync-and-merge.mjs` for safe merge.
11. Running W5 closeout gate.
12. Reporting a final summary.

## Automatic Commit Rules

Allowed by default:

- `docs/ops/runs/**`
- `docs/ops/**`
- `scripts/ops/**`

Commit messages:

| Scope | Message |
| --- | --- |
| only `docs/ops/runs/**` | `docs(ops): record generated ops run artifacts` |
| docs ops artifacts | `docs(ops): record generated ops artifacts` |
| scripts ops artifacts | `chore(ops): update automation tooling` |
| unknown safe Agent output | `chore(ops): record agent task output` |

Business code is not auto-committed unless `--allow-code` is provided, and migration/schema/entity/table/column remains blocked.

## Rebase Rules

Autopilot rebases the target worktree on main. If a conflict appears:

1. `docs/ops/runs/**` conflict can be auto-resolved once per retry by preserving the main-side audit baseline and continuing.
2. Business code conflict becomes HOLD.
3. Migration/schema/entity/table/column conflict becomes HOLD.
4. Any conflict needing business judgment becomes HOLD.

## Merge Rules

Autopilot delegates final safe merge to `agent-sync-and-merge.mjs`, which remains the lower-level safe merge preflight.

`agent-baseline-autopilot.mjs` is the normal daily entrypoint. `agent-sync-and-merge.mjs` is the lower-level merge helper.

## Three Retry Rule

Autopilot defaults to `--max-retries 3`. Retryable cases include:

- `docs/ops/runs/**` dirty artifacts.
- Safe docs/ops or scripts/ops uncommitted output.
- Worktree behind main.
- Fast-forward merge needing rebase.
- Docs-only run artifact conflict.

If retries exceed the limit, the flow becomes HOLD and prints the reason.

## HOLD Rules

Autopilot must HOLD for:

- `apps/api/**` unless explicitly allowed by `--allow-code`.
- `apps/web/**` unless explicitly allowed by `--allow-code`.
- migration/schema/entity/table/column.
- Auth/RBAC/DataScope/Finance/Payment/Chanjet high-risk code conflicts.
- Deployment script conflicts.
- Any required business-logic judgment.
- `git reset --hard`.
- `git clean -fd`.
- Push.
- Deploy.
- Migration execution.
- DB write.

## Hard Boundaries

Autopilot never pushes, never deploys, never executes migrations, and never writes databases.

## Shortest Command

```bash
node scripts/ops/agent-baseline-autopilot.mjs --agent Codex-Orchestrator --branch w5-codex-orchestrator --yes
```

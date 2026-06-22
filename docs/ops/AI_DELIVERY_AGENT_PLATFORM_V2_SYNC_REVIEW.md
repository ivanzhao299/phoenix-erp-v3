# AI Delivery Agent Platform V2 Sync Review

## 1. Stage Goal

Add automated worktree sync and safe merge preflight so routine main/worktree rebase, generated run artifact handling, and safe merge checks no longer require manual command copying.

## 2. New / Modified Files

1. `scripts/ops/agent-sync-and-merge.mjs`
2. `scripts/ops/agent-orchestrator.mjs`
3. `scripts/ops/agent-auto-merge.mjs`
4. `scripts/ops/agent-worker.mjs`
5. `docs/ops/AUTOMATED_WORKTREE_SYNC_AND_SAFE_MERGE.md`
6. `docs/ops/MERGE_AGENT_BRANCH_RUNBOOK.md`
7. `docs/ops/AI_DELIVERY_AGENT_PLATFORM_V2_SYNC_REVIEW.md`
8. `docs/ops/AGENT_TASK_BOARD.md`

## 3. Automated Sync Capability

`agent-sync-and-merge.mjs` verifies `/Users/mac/phoenix-erp`, requires `main`, handles generated run artifacts, locates the target branch worktree, checks cleanliness, rebases the worktree, and delegates merge safety to `merge-agent-to-main.mjs`.

## 4. Auto Commit docs/ops/runs Capability

Generated run artifacts under `docs/ops/runs/**` can be committed automatically with:

```text
docs(ops): record generated ops run artifacts
```

Dry-run reports the planned commit without changing main.

## 5. Auto Rebase Capability

The sync script performs `git rebase main` in the target worktree in approved `--yes` mode. `agent-worker.mjs` also detects worktrees behind main and can rebase before real execution.

## 6. Safe Merge Capability

Safe merge remains handled by `merge-agent-to-main.mjs`. The new sync script calls it after rebase and passes through `--allow-code` and `--schema-gate`.

## 7. Conflict Stop Capability

Rebase conflicts stop immediately. The script prints the worktree, conflict files, and the manual `git rebase --continue` / `git rebase --abort` recovery path.

## 8. Dry-Run Test Result

Command:

```bash
cd /Users/mac/phoenix-erp
node /Users/mac/phoenix-erp-worktrees/codex-orchestrator/scripts/ops/agent-sync-and-merge.mjs w5-codex-orchestrator --dry-run
```

Pre-commit safety result:

1. Main contained only generated `docs/ops/runs/**` artifacts.
2. Dry-run reported that those artifacts would be auto-committed instead of requiring manual cleanup.
3. Target worktree was intentionally dirty because this V2-SYNC change was in progress.
4. Script stopped before rebase and printed the target worktree plus dirty file list.
5. No merge, push, deploy, migration, or DB write occurred.

This confirms both run-artifact handling and dirty target worktree stop behavior.

Clean target dry-run is expected after this branch commit, before merge to main.

## 9. Forbidden Dirty Boundary

The script only auto-handles `docs/ops/runs/**`. Any dirty `apps/api/**`, `apps/web/**`, migration, schema, entity, table, column, or other non-run-artifact path stops immediately.

## 10. Current Limits

1. No automatic conflict resolution.
2. No push.
3. No deploy.
4. No migration execution.
5. No database writes.
6. Business code dirty files stop the script.

## 11. Next Recommendation

After this branch is merged, daily Agent branch merges should use:

```bash
cd /Users/mac/phoenix-erp
node scripts/ops/agent-sync-and-merge.mjs <branch> --yes
```

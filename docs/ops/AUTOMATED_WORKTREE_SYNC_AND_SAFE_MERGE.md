# Automated Worktree Sync And Safe Merge

## 1. Why Manual Sync Should Stop

Manual rebase and merge commands across `main`, A1, A2, A3, and Codex-Orchestrator are repetitive and error-prone. The platform should own routine preflight steps so humans only decide high-risk gates.

## 2. Script Responsibility

`scripts/ops/agent-sync-and-merge.mjs` provides one controlled entrypoint for:

1. main branch validation;
2. `docs/ops/runs/**` artifact handling;
3. target worktree discovery;
4. target worktree clean checks;
5. target branch `git rebase main`;
6. safe merge through `merge-agent-to-main.mjs`;
7. post-merge status/log/gate summary.

Generated Agent work uses a task-generation branch such as `codex/task/<task-id>/g1/a3`. The long-lived `w5-a1-*` through `w5-a7-*` branches are templates and are rejected for real task merge.

## 3. Correct Input Location

Run from the main repository:

```bash
cd /Users/mac/phoenix-erp
git branch --show-current
```

Required branch: `main`.

## 4. Main Dirty Rules

If `main` has dirty files:

1. all dirty files under `docs/ops/runs/**`: allowed as generated audit artifacts;
2. any other dirty file: stop immediately;
3. business code dirty files are never auto-handled.

## 5. docs/ops/runs Audit Commit

Default behavior allows generated run artifacts to be committed before merge:

- `--dry-run`: reports that it would commit them;
- `--yes`: commits them with `docs(ops): record generated ops run artifacts`;
- `--skip-auto-commit-runs`: refuses dirty run artifacts.

## 6. Worktree Rebase Rule

The script finds the target branch worktree, verifies it is clean, and rebases it onto `main`.

Dry-run prints the intended rebase. `--yes` performs it.

## 7. Conflict Stop Rule

If rebase conflicts:

1. stop immediately;
2. print target worktree;
3. print conflict files;
4. instruct the user to run `git rebase --continue` or `git rebase --abort`.

The script never auto-resolves conflicts.

## 8. Script Division Of Labor

`agent-sync-and-merge.mjs` is the daily operator entrypoint.

`merge-agent-to-main.mjs` remains the lower-level safe fast-forward merge checker. It should usually be called by `agent-sync-and-merge.mjs`.

## 9. Hard Boundaries

The sync script does not:

1. push;
2. deploy;
3. execute migration;
4. write databases;
5. auto-handle business code dirty files;
6. auto-resolve conflicts.

## 10. Short Commands

Dry-run:

```bash
cd /Users/mac/phoenix-erp
node scripts/ops/agent-sync-and-merge.mjs w5-codex-orchestrator --dry-run
```

Approved safe merge:

```bash
cd /Users/mac/phoenix-erp
node scripts/ops/agent-sync-and-merge.mjs w5-codex-orchestrator --yes
```

Schema gate dry-run:

```bash
cd /Users/mac/phoenix-erp
node scripts/ops/agent-sync-and-merge.mjs codex/task/req-store-payment-001-a3/g1/a3 --schema-gate REQ-STORE-PAYMENT-001 --dry-run
```

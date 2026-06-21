# Merge Agent Branch Runbook

## Purpose

`scripts/ops/merge-agent-to-main.mjs` standardizes safe fast-forward merges from Agent branches into `main`.

The script checks branch state, working tree cleanliness, changed files, freeze boundaries, fast-forward eligibility, and optional CI gate scripts. It does not push or deploy.

## Correct Input Location

Run from macOS Terminal:

```bash
cd /Users/mac/phoenix-erp
git branch --show-current
```

Required current branch:

```text
main
```

Do not run this script inside an Agent worktree.

## Common Commands

Dry run:

```bash
node scripts/ops/merge-agent-to-main.mjs w5-codex-orchestrator --dry-run
```

Formal fast-forward merge with confirmation prompt:

```bash
node scripts/ops/merge-agent-to-main.mjs w5-codex-orchestrator
```

Formal fast-forward merge without prompt:

```bash
node scripts/ops/merge-agent-to-main.mjs w5-codex-orchestrator --yes
```

Allow code paths, while still blocking migration/schema/entity/table/column changes:

```bash
node scripts/ops/merge-agent-to-main.mjs w5-a3-backend-critical-path --allow-code --dry-run
```

## Examples

```bash
node scripts/ops/merge-agent-to-main.mjs w5-codex-orchestrator --dry-run
node scripts/ops/merge-agent-to-main.mjs w5-codex-orchestrator --yes
node scripts/ops/merge-agent-to-main.mjs w5-a5-data-readiness --dry-run
node scripts/ops/merge-agent-to-main.mjs w5-a2-security-regression-gate --yes
```

## What The Script Checks

1. Runs inside a git repository.
2. Current branch is `main`.
3. `main` working tree is clean.
4. Target branch exists.
5. Prints current `main` HEAD and target branch HEAD.
6. Prints diff file list and diff stat.
7. Blocks frozen paths by default.
8. Uses `git merge --ff-only`.
9. Refuses ordinary merge commits.
10. Runs available CI gate scripts after merge:
   - `scripts/ci/check-freeze-boundaries.mjs`
   - `scripts/ci/check-security-regression.mjs`
   - `scripts/ci/check-w5-closeout-gate.mjs`

## Explicitly Forbidden Uses

1. Do not run in an Agent worktree.
2. Do not run in the wrong project directory.
3. Do not use it for migration/schema/entity/table/column merges.
4. Do not expect it to push.
5. Do not expect it to deploy.
6. Do not use it to bypass review when `--allow-code` is required.

## Freeze Boundary Defaults

Default allowed paths:

1. `docs/ops/**`
2. `scripts/ops/**`
3. `scripts/ci/**`
4. `.github/**`

Default blocked paths include:

1. `apps/api/**`
2. `apps/web/**`
3. `apps/api/src/database/migrations/**`
4. `migrations/**`
5. any path containing `migration` or `migrations`
6. `*.entity.ts`
7. any path containing `/entities/`
8. paths containing `schema`, `table`, or `column`

`--allow-code` can allow `apps/api/**` and `apps/web/**`, but still does not allow migration/schema/entity/table/column changes.

## Rollback Advice

If a just-finished fast-forward merge is wrong:

1. Run `git log --oneline --decorate -8`.
2. Identify the previous `main` HEAD.
3. Ask the user to decide whether to reset or revert.
4. Do not let this script auto-reset. It intentionally avoids destructive recovery actions.

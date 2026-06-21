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

Schema Gate dry run:

```bash
node scripts/ops/merge-agent-to-main.mjs w5-a3-backend-critical-path --schema-gate REQ-STORE-PAYMENT-UNIFIED-CODE-001 --dry-run
```

Schema Gate fast-forward merge after approval:

```bash
node scripts/ops/merge-agent-to-main.mjs w5-a3-backend-critical-path --schema-gate REQ-STORE-PAYMENT-UNIFIED-CODE-001 --yes
```

## Examples

```bash
node scripts/ops/merge-agent-to-main.mjs w5-codex-orchestrator --dry-run
node scripts/ops/merge-agent-to-main.mjs w5-codex-orchestrator --yes
node scripts/ops/merge-agent-to-main.mjs w5-a5-data-readiness --dry-run
node scripts/ops/merge-agent-to-main.mjs w5-a2-security-regression-gate --yes
node scripts/ops/merge-agent-to-main.mjs w5-a3-backend-critical-path --schema-gate REQ-STORE-PAYMENT-UNIFIED-CODE-001 --dry-run
```

## What The Script Checks

1. Runs inside a git repository.
2. Current branch is `main`.
3. `main` working tree is clean.
4. Target branch exists.
5. Prints current `main` HEAD and target branch HEAD.
6. Checks branch relationship before printing diff.
7. Prints diff file list and diff stat only for fast-forward candidates.
8. Blocks frozen paths by default.
9. Uses `git merge --ff-only`.
10. Refuses ordinary merge commits.
11. Runs available CI gate scripts after merge:
   - `scripts/ci/check-freeze-boundaries.mjs`
   - `scripts/ci/check-security-regression.mjs`
   - `scripts/ci/check-w5-closeout-gate.mjs`

## Branch Relationship Outcomes

| Outcome | Meaning | Script behavior |
| --- | --- | --- |
| already at main HEAD | Target branch HEAD equals current `main` HEAD. | Prints `Target branch is already at main HEAD. Nothing to merge.` and exits 0. |
| already merged into main | Target branch is an ancestor of `main`. | Prints `Target branch is already merged into main. Nothing to merge.` and exits 0 without printing a deletion diff. |
| fast-forward candidate | `main` is an ancestor of target branch. | Prints diff/stat, runs freeze checks, then merges only with `git merge --ff-only` unless `--dry-run`. |
| diverged from main | Neither branch is ancestor of the other. | Prints `Target branch has diverged from main. Refusing merge.` and exits 1 without printing a deletion diff. |

Do not run `--yes` against already-merged old Agent branches. If the script says `already merged`, that is a clean no-op, not an error.

## Schema Gate Mode

Schema Gate mode is for carefully merging a pre-reviewed schema implementation branch after the user has approved the gate. It is still a merge safety check, not a DB migration runner.

Correct input location:

```bash
cd /Users/mac/phoenix-erp
git branch --show-current
```

Required branch:

```text
main
```

Example dry run:

```bash
node scripts/ops/merge-agent-to-main.mjs w5-a3-backend-critical-path --schema-gate REQ-STORE-PAYMENT-UNIFIED-CODE-001 --dry-run
```

Example approved fast-forward merge:

```bash
node scripts/ops/merge-agent-to-main.mjs w5-a3-backend-critical-path --schema-gate REQ-STORE-PAYMENT-UNIFIED-CODE-001 --yes
```

Important boundaries:

1. Schema Gate only permits merging reviewed code/schema files; it does not execute migrations.
2. DB migration execution must happen in a separate DB Migration Gate.
3. Schema Gate is not production release.
4. Schema Gate is not automatic go-live.
5. Schema Gate does not push.
6. Schema Gate does not deploy.

For `REQ-STORE-PAYMENT-UNIFIED-CODE-001`, Schema Gate mode allows only:

1. `apps/api/src/database/migrations/1782041418112-CreateStorePaymentTables.ts`
2. `apps/api/src/modules/store-payment/**`
3. related `docs/ops/**` reports for the request

It still rejects:

1. any other migration,
2. `apps/web/**`,
3. procurement/sales/finance/chanjet module changes,
4. data DML in migration,
5. `DROP COLUMN`,
6. deploy-chain changes,
7. migration execution.

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

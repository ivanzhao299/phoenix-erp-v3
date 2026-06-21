# A4 Frontend Task Prompt

## Agent Identity

You are `A4-Frontend-UAT-Smoke`.

## Worktree and Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke`

Branch: `w5-a4-frontend-uat-smoke`

## Execution Checks

Run:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
```

Stop if directory, branch, or worktree cleanliness is invalid.

## Allowed Scope

Approved frontend pages, components, styles, frontend tests, UAT smoke evidence, and docs/ops reports.

## Forbidden Scope

No backend logic, migrations, schema/entity/table/column edits, production deploy, database writes, push, or hidden permission bypass.

## Output Report Format

Write a report with user paths tested, screenshots or smoke evidence where applicable, permissions visible, failed states, changed files, and next recommendation.

## Commit Rule

Commit only approved frontend files and report.

## Failure Rule

Stop on backend dependency missing, forbidden scope, unverified UI path, unexpected dirty files, or permission ambiguity.

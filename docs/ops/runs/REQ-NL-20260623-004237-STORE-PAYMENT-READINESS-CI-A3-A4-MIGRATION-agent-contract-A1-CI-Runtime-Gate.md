# Agent Contract

## Request ID

REQ-NL-20260623-004237-STORE-PAYMENT-READINESS-CI-A3-A4-MIGRATION

## Assigned Agent

A1-CI-Runtime-Gate

## Worktree

`/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate`

## Branch

`w5-a1-ci-runtime-gate`

## Source Request

检查 Store Payment 数据 readiness 和 CI 验证，不允许 A3/A4，不改业务代码，不执行 migration，不部署

## Role

CI、typecheck、build、startup、post-merge validation

## Allowed Actions

1. Follow this contract and the Agent base prompt.
2. Produce the required report under `docs/ops/`.
3. Run only checks appropriate for validation-after-implementation-or-merge.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write databases.
6. Do not modify schema/entity/table/column files.
7. Do not work outside the approved scope.

## Required Output

`docs/ops/REQ-NL-20260623-004237-STORE-PAYMENT-READINESS-CI-A3-A4-MIGRATION_A1-CI-Runtime-Gate_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

LOW/MEDIUM

# Agent Contract

## Request ID

REQ-NL-20260622-232813-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS

## Assigned Agent

A1-CI-Runtime-Gate

## Worktree

`/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate`

## Branch

`w5-a1-ci-runtime-gate`

## Source Request

对 Store Payment 试点 readiness 做只读安全复核、CI 验证和数据准备检查；只允许 A2 安全审查、A1 CI 验证、A5 数据 readiness，不改业务代码，不执行 migration，不写数据库，不部署

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

`docs/ops/REQ-NL-20260622-232813-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS_A1-CI-Runtime-Gate_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

LOW/MEDIUM

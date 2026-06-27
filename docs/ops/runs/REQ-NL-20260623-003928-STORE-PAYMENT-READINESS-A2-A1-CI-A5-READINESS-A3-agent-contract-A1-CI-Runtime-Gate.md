# Agent Contract

## Request ID

REQ-NL-20260623-003928-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3

## Assigned Agent

A1-CI-Runtime-Gate

## Worktree

`/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate`

## Branch

`w5-a1-ci-runtime-gate`

## Source Request

对 Store Payment 试点 readiness 做低风险并行验证：只允许 A2 安全只读审查、A1 CI 验证、A5 数据 readiness 检查；不允许 A3/A4 修改业务代码，不执行 migration，不写数据库，不部署，不 push

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

`docs/ops/REQ-NL-20260623-003928-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A1-CI-Runtime-Gate_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

LOW/MEDIUM

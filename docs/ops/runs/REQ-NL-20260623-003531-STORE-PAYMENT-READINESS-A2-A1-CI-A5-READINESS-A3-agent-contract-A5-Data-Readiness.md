# Agent Contract

## Request ID

REQ-NL-20260623-003531-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3

## Assigned Agent

A5-Data-Readiness

## Worktree

`/Users/mac/phoenix-erp-worktrees/a5-data-readiness`

## Branch

`w5-a5-data-readiness`

## Source Request

对 Store Payment 试点 readiness 做低风险并行验证：只允许 A2 安全只读审查、A1 CI 验证、A5 数据 readiness 检查；不允许 A3/A4 修改业务代码，不执行 migration，不写数据库，不部署，不 push

## Role

主数据、数据基线、灰度数据条件、只读核查

## Allowed Actions

1. Follow this contract and the Agent base prompt.
2. Produce the required report under `docs/ops/`.
3. Run only checks appropriate for read-only-data-readiness.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write databases.
6. Do not modify schema/entity/table/column files.
7. Do not work outside the approved scope.

## Required Output

`docs/ops/REQ-NL-20260623-003531-STORE-PAYMENT-READINESS-A2-A1-CI-A5-READINESS-A3_A5-Data-Readiness_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

LOW/MEDIUM

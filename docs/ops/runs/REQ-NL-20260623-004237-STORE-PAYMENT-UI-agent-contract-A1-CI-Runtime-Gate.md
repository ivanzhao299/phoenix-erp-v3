# Agent Contract

## Request ID

REQ-NL-20260623-004237-STORE-PAYMENT-UI

## Assigned Agent

A1-CI-Runtime-Gate

## Worktree

`/Users/mac/phoenix-erp-worktrees/a1-ci-runtime-gate`

## Branch

`w5-a1-ci-runtime-gate`

## Source Request

优化 Store Payment 页面 UI，让表单、表格、按钮、状态标签更清爽现代，不改后端接口

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

`docs/ops/REQ-NL-20260623-004237-STORE-PAYMENT-UI_A1-CI-Runtime-Gate_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

MEDIUM

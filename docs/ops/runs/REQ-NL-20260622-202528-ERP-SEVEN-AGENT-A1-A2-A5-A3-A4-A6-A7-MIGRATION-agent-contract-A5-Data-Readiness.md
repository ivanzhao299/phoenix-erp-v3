# Agent Contract

## Request ID

REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION

## Assigned Agent

A5-Data-Readiness

## Worktree

`/Users/mac/phoenix-erp-worktrees/a5-data-readiness`

## Branch

`w5-a5-data-readiness`

## Source Request

为当前 ERP 需求生成 seven-agent 并行闭环计划，覆盖 A1/A2/A5/A3/A4/A6/A7，不执行 migration，不部署，不写库

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

`docs/ops/REQ-NL-20260622-202528-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION_A5-Data-Readiness_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

LOW

# Agent Contract

## Request ID

REQ-NL-20260622-202514-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION

## Assigned Agent

A6-Staging-Deploy-Runbook

## Worktree

`/Users/mac/phoenix-erp-worktrees/a6-staging-deploy-runbook`

## Branch

`w5-a6-staging-deploy-runbook`

## Source Request

为当前 ERP 需求生成 seven-agent 并行闭环计划，覆盖 A1/A2/A5/A3/A4/A6/A7，不执行 migration，不部署，不写库

## Role

staging runbook、环境矩阵、回滚手册、health check

## Allowed Actions

1. Follow this contract and the Agent base prompt.
2. Produce the required report under `docs/ops/`.
3. Run only checks appropriate for deploy-runbook-only-before-go.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write databases.
6. Do not modify schema/entity/table/column files.
7. Do not work outside the approved scope.

## Required Output

`docs/ops/REQ-NL-20260622-202514-ERP-SEVEN-AGENT-A1-A2-A5-A3-A4-A6-A7-MIGRATION_A6-Staging-Deploy-Runbook_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

HIGH

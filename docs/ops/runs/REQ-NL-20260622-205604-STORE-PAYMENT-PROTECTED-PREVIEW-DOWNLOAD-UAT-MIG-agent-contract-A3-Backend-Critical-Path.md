# Agent Contract

## Request ID

REQ-NL-20260622-205604-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UAT-MIG

## Assigned Agent

A3-Backend-Critical-Path

## Worktree

`/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`

## Branch

`w5-a3-backend-critical-path`

## Source Request

推进 Store Payment 进入可试点状态：补齐菜单码和角色授权方案、附件 protected preview/download 方案、前端 UAT 页面计划、migration 执行前置清单、预发部署 runbook 和终验 Gate；按七 Agent 闭环分配任务，不改未授权业务代码，不执行 migration，不部署

Routing hint: A1/A2/A3/A4/A5/A6/A7 seven-agent acceptance drill.

## Role

后端实现、controller/service/module、关键路径

## Allowed Actions

1. Follow this contract and the Agent base prompt.
2. Produce the required report under `docs/ops/`.
3. Run only checks appropriate for approved-backend-implementation.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write databases.
6. Do not modify schema/entity/table/column files.
7. Do not work outside the approved scope.

## Required Output

`docs/ops/REQ-NL-20260622-205604-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UAT-MIG_A3-Backend-Critical-Path_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

MEDIUM

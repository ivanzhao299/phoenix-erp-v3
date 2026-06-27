# Agent Contract

## Request ID

REQ-NL-20260622-234717-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U

## Assigned Agent

A4-Frontend-UAT-Smoke

## Worktree

`/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke`

## Branch

`w5-a4-frontend-uat-smoke`

## Source Request

推进 Store Payment 进入可试点状态：补齐菜单码和角色授权方案、附件 protected preview/download 方案、前端 UI/UX 和 UAT 页面计划、数据 readiness 检查、migration 执行前置清单、预发部署 runbook 和终验 Gate；按七 Agent 闭环分配任务，不改未授权业务代码，不执行 migration，不写数据库，不部署

## Role

前端页面开发、UI/UX 优化、样式调整、响应式适配、前端权限可见性、路由菜单显示、UAT smoke

## Allowed Actions

1. Follow this contract and the Agent base prompt.
2. Produce the required report under `docs/ops/`.
3. Run only checks appropriate for after-backend-security-validation.

## Forbidden Actions

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write databases.
6. Do not modify schema/entity/table/column files.
7. Do not work outside the approved scope.

## Required Output

`docs/ops/REQ-NL-20260622-234717-STORE-PAYMENT-PROTECTED-PREVIEW-DOWNLOAD-UI-UX-U_A4-Frontend-UAT-Smoke_REPORT.md`

## Stop Rules

Stop if the request requires forbidden actions, dirty worktree, wrong branch, missing dependencies, or unclear approval.

## Risk

MEDIUM

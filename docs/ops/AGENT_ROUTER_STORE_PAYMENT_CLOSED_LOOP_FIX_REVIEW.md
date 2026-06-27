# Agent Router Store Payment Closed-loop Fix Review

## Goal

Fix Store Payment closed-loop routing so menu code, role authorization, and protected attachment preview/download wording selects A2 and A3 in addition to A1/A4/A5/A6/A7.

## Problem

The original closed-loop request selected:

- A4-Frontend-UAT-Smoke
- A1-CI-Runtime-Gate
- A5-Data-Readiness
- A6-Staging-Deploy-Runbook
- A7-Final-QA-Gate

It missed:

- A2-Security-Regression-Gate
- A3-Backend-Critical-Path

## Fix

Updated `docs/ops/AGENT_ROUTER_RULES.json` and `scripts/ops/agent-route-request.mjs` so:

1. Menu code, role authorization, permission seed/register, backend authorization, API draft, service/controller/module, and protected attachment endpoint wording force A3.
2. Permission, menu code, role authorization, RBAC, DataScope, protected attachment, protected preview/download, attachment ACL, overreach, sensitive logs, and security review wording force A2.
3. Requests containing both menu/role authorization and protected preview/download select both A2 and A3.

## Expected Dispatch

Group 1:

- A5-Data-Readiness
- A2-Security-Regression-Gate
- A1-CI-Runtime-Gate

Group 2:

- A3-Backend-Critical-Path

Group 3:

- A4-Frontend-UAT-Smoke

Group 4:

- A6-Staging-Deploy-Runbook
- A7-Final-QA-Gate

The exact group ordering may follow current Router sorting, but all seven Agents must be selected.

## Validation

Command:

```bash
node scripts/ops/agent-orchestrator.mjs \
  --request "推进 Store Payment 进入可试点状态：补齐菜单码和角色授权方案、附件 protected preview/download 方案、前端 UI/UX 和 UAT 页面计划、数据 readiness 检查、migration 执行前置清单、预发部署 runbook 和终验 Gate；按七 Agent 闭环分配任务，不改未授权业务代码，不执行 migration，不写数据库，不部署" \
  --mode closed-loop \
  --parallel 3 \
  --dry-run \
  --output-dir docs/ops/runs
```

Result:

- Selected agents: `A3-Backend-Critical-Path`, `A2-Security-Regression-Gate`, `A1-CI-Runtime-Gate`, `A5-Data-Readiness`, `A4-Frontend-UAT-Smoke`, `A6-Staging-Deploy-Runbook`, `A7-Final-QA-Gate`.
- Dispatch groups: `[A2, A1, A5]`, `[A3]`, `[A4]`, `[A6, A7]`.
- Created tasks: 7.
- Codex CLI executed: No.
- Baseline autopilot will run after Agent completion.
- User manual rebase required: false.
- User manual merge required: false.
- User manual `docs/ops/runs` cleanup required: false.

## Safety

- Codex CLI executed: No.
- Business code changed: No.
- Migration executed: No.
- Database written: No.
- Deployment executed: No.

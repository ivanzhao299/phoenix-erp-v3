# Agent Platform V2 95 Acceptance Plan

## Goal

Validate that the seven-Agent closed-loop platform is usable for real ERP business development without executing production deploy, migration, DB write, or unauthorized business code changes.

## Business Drill Request

推进 Store Payment 进入可试点状态：补齐菜单码和角色授权方案、附件 protected preview/download 方案、前端 UAT 页面计划、migration 执行前置清单、预发部署 runbook 和终验 Gate；按七 Agent 闭环分配任务，不改未授权业务代码，不执行 migration，不部署。

## Agent Coverage

1. Codex-Orchestrator: intake, routing, task queue, acceptance reporting.
2. A5: data readiness / store / company / account / role mapping.
3. A3: backend authorization, attachment protection, menu wiring boundary/task package.
4. A4: frontend UAT page, route, permissions, form/list smoke plan.
5. A2: RBAC/DataScope/attachment ACL/log masking security review.
6. A1: CI/typecheck/gate validation.
7. A6: staging runbook, env, rollback, migration preflight checklist.
8. A7: GO/HOLD/ROLLBACK final gate.

## Acceptance Steps

1. Run `node --check` for all ops scripts.
2. Run `agent-acceptance-drill.mjs` with the Store Payment request.
3. Confirm task queue contains A1-A7 tasks.
4. Confirm A1-A7 workers can dry-run claim generated tasks.
5. Confirm unfinished task diagnosis returns HOLD.
6. Confirm auto-merge refuses HOLD task.
7. Confirm release state machine can dry-run transition to `TASKS_CREATED`.

## Hard Boundaries

1. No Codex CLI real execution.
2. No real merge.
3. No push.
4. No migration execution.
5. No database write.
6. No production deploy.
7. No unauthorized `apps/api/**` or `apps/web/**` changes.
